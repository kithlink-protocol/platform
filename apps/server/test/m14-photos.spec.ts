import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { createDb, type DbHandles } from '@kithlink/db';
import {
  PHOTO_ALLOWED_MIMES,
  photoExtensionFor,
  photoPresignInputSchema,
} from '../src/modules/animals/animals.service';
import { AppModule } from '../src/app.module';
import { ProblemFilter } from '../src/common/http-exception.filter';
import { S3Service } from '../src/modules/s3/s3.module';
import { TenantService } from '../src/modules/db.module';
import { runSeed } from '../scripts/seed';

describe('m14 photo contract bounds (unit)', () => {
  it('restricts presign to the image mime allow-list', () => {
    expect(PHOTO_ALLOWED_MIMES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(photoExtensionFor('application/pdf')).toBeNull();
    expect(photoExtensionFor('image/gif')).toBeNull();
    for (const mime of PHOTO_ALLOWED_MIMES) {
      const parsed = photoPresignInputSchema.parse({ mime, bytes: 1024 });
      expect(parsed.bytes).toBe(1024);
    }
  });

  it('maps allowed mimes to storage extensions', () => {
    expect(photoExtensionFor('image/jpeg')).toBe('jpg');
    expect(photoExtensionFor('image/png')).toBe('png');
    expect(photoExtensionFor('image/webp')).toBe('webp');
  });

  it('rejects size hints outside 1..8MB', () => {
    expect(() => photoPresignInputSchema.parse({ mime: 'image/png', bytes: 0 })).toThrow();
    expect(() => photoPresignInputSchema.parse({ mime: 'image/png', bytes: 8_388_609 })).toThrow();
    expect(photoPresignInputSchema.parse({ mime: 'image/png', bytes: 8_388_608 }).bytes).toBe(8_388_608);
  });
});

const testUrl = process.env.TEST_DATABASE_URL;
const s3Endpoint = process.env.S3_ENDPOINT;

describe.skipIf(!testUrl)('m14 photos integration', () => {
  let app: INestApplication;
  let tenants: TenantService;
  let handles: DbHandles;
  let shelterId: string;
  let devCookie: string[];

  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    handles = createDb(testUrl!, 5);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(helmet());
    app.use(cookieParser());
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
    tenants = app.get(TenantService);
    await runSeed(handles);
    const rows = (await tenants.service(
      sql => sql`select id from shelters where slug = 'happytail'`,
    )) as unknown as { id: string }[];
    shelterId = rows[0]!.id;
    const login = await request(app.getHttpServer())
      .post('/app/v1/auth/login')
      .send({ email: 'dev@kithlink.dev', password: 'DevOnly123!x' });
    expect(login.status).toBe(200);
    devCookie = login.headers['set-cookie'];
  }, 30000);

  afterAll(async () => {
    await app?.close();
    await handles?.sql.end({ timeout: 5 });
  });

  const http = () => request(app.getHttpServer());
  const sha256Hex = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

  async function createAnimal(name: string): Promise<string> {
    const res = await http()
      .post(`/admin/v1/shelters/${shelterId}/animals`)
      .set('Cookie', devCookie)
      .send({ name, species: 'dog' });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function presign(animalId: string, mime: string, size: number) {
    const res = await http()
      .post(`/admin/v1/shelters/${shelterId}/animals/${animalId}/photos/presign`)
      .set('Cookie', devCookie)
      .send({ mime, bytes: size });
    return res;
  }

  async function putBytes(uploadUrl: string, bytes: Buffer, mime: string): Promise<Response> {
    return fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mime },
      body: new Uint8Array(bytes),
    }) as unknown as Response;
  }

  async function uploadPhoto(
    animalId: string,
    bytes: Buffer,
    mime = 'image/png',
  ): Promise<{ photoId: string; key: string }> {
    const p = await presign(animalId, mime, bytes.length);
    expect(p.status).toBe(201);
    const put = await putBytes(p.body.uploadUrl as string, bytes, mime);
    expect(put.status).toBe(200);
    const complete = await http()
      .post(
        `/admin/v1/shelters/${shelterId}/animals/${animalId}/photos/${p.body.photoId}/upload-complete`,
      )
      .set('Cookie', devCookie)
      .send({ sha256: sha256Hex(bytes) });
    expect(complete.status).toBe(201);
    return { photoId: p.body.photoId as string, key: p.body.key as string };
  }

  (s3Endpoint ? describe : describe.skip)('MinIO-backed flow', () => {
    it('presign → PUT → upload-complete stores sha/bytes and appends position', async () => {
      const animalId = await createAnimal(`M14Happy-${Date.now()}`);
      const bytes = Buffer.from('m14-photo-happy-bytes');
      const { photoId } = await uploadPhoto(animalId, bytes);

      const rows = (await tenants.service(
        sql =>
          sql`select bytes, sha256, position from animal_photos where id = ${photoId}::uuid`,
      )) as unknown as { bytes: number; sha256: string; position: number }[];
      expect(Number(rows[0]!.bytes)).toBe(bytes.length);
      expect(rows[0]!.sha256).toBe(sha256Hex(bytes));
      expect(Number(rows[0]!.position)).toBeGreaterThan(0);

      const detail = await http()
        .get(`/admin/v1/shelters/${shelterId}/animals/${animalId}`)
        .set('Cookie', devCookie);
      expect(detail.status).toBe(200);
      const photo = (detail.body.photos as { id: string; url: string | null }[]).find(
        candidate => candidate.id === photoId,
      );
      expect(photo?.url).toContain(`/public/v1/animal-photos/${photoId}`);
    }, 30000);

    it('rejects a wrong sha256 with 409 and removes the object', async () => {
      const animalId = await createAnimal(`M14Bad-${Date.now()}`);
      const bytes = Buffer.from('m14-photo-bad-bytes');
      const p = await presign(animalId, 'image/png', bytes.length);
      expect(p.status).toBe(201);
      const put = await putBytes(p.body.uploadUrl as string, bytes, 'image/png');
      expect(put.status).toBe(200);

      const wrong = Buffer.from('different-bytes');
      const complete = await http()
        .post(
          `/admin/v1/shelters/${shelterId}/animals/${animalId}/photos/${p.body.photoId}/upload-complete`,
        )
        .set('Cookie', devCookie)
        .send({ sha256: sha256Hex(wrong) });
      expect(complete.status).toBe(409);

      const s3 = app.get(S3Service);
      expect(await s3.head(p.body.key as string)).toBeNull();
    }, 30000);

    it('streams photos publicly with immutable caching, even for adopted animals', async () => {
      const animalId = await createAnimal(`M14Stream-${Date.now()}`);
      const bytes = Buffer.from('m14-photo-stream-bytes');
      const { photoId } = await uploadPhoto(animalId, bytes);

      const adopt = await http()
        .patch(`/admin/v1/shelters/${shelterId}/animals/${animalId}`)
        .set('Cookie', devCookie)
        .send({ status: 'adopted' });
      expect(adopt.status).toBe(200);

      const stream = await http()
        .get(`/public/v1/animal-photos/${photoId}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(stream.status).toBe(200);
      expect(stream.headers['content-type']).toMatch(/^image\/png/i);
      expect(stream.headers['cache-control']).toContain('immutable');
      expect(stream.headers['cache-control']).toContain('max-age=31536000');
      expect(Buffer.compare(stream.body as Buffer, bytes)).toBe(0);
    }, 30000);

    it('deletes the row and object via the admin route', async () => {
      const animalId = await createAnimal(`M14Delete-${Date.now()}`);
      const bytes = Buffer.from('m14-photo-delete-bytes');
      const { photoId, key } = await uploadPhoto(animalId, bytes);
      const s3 = app.get(S3Service);
      expect(await s3.head(key)).not.toBeNull();

      const del = await http()
        .delete(`/admin/v1/shelters/${shelterId}/animals/${animalId}/photos/${photoId}`)
        .set('Cookie', devCookie);
      expect(del.status).toBe(204);

      expect(await s3.head(key)).toBeNull();
      const stream = await http().get(`/public/v1/animal-photos/${photoId}`);
      expect(stream.status).toBe(404);
    }, 30000);

    it('blocks cross-tenant staff from presigning and deleting with 403', async () => {
      const bEmail = `m14-staff-b-${Date.now()}@x.dev`;
      await http().post('/app/v1/auth/register').send({ email: bEmail, password: 'Password123x' });
      await tenants.service(async sql => {
        const rows = (await sql`
          insert into shelters (slug, name) values (${'m14-shelter-b-' + Date.now()}, 'M14 Shelter B')
          returning id`) as unknown as { id: string }[];
        await sql`
          insert into staff_members (shelter_id, user_id, role)
          select ${rows[0]!.id}, u.id, 'owner'
          from users u
          where u.email = ${bEmail}`;
      });
      const bLogin = await http()
        .post('/app/v1/auth/login')
        .send({ email: bEmail, password: 'Password123x' });
      expect(bLogin.status).toBe(200);
      const bCookie = bLogin.headers['set-cookie'];

      const animalId = await createAnimal(`M14Cross-${Date.now()}`);

      const foreignPresign = await http()
        .post(`/admin/v1/shelters/${shelterId}/animals/${animalId}/photos/presign`)
        .set('Cookie', bCookie)
        .send({ mime: 'image/png', bytes: 10 });
      expect(foreignPresign.status).toBe(403);

      const foreignDelete = await http()
        .delete(`/admin/v1/shelters/${shelterId}/animals/${animalId}/photos/${crypto.randomUUID()}`)
        .set('Cookie', bCookie);
      expect(foreignDelete.status).toBe(403);
    }, 30000);
  });
});
