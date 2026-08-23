import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { createDb, type DbHandles } from '@kithlink/db';
import { AppModule } from '../src/app.module';
import { ProblemFilter } from '../src/common/http-exception.filter';
import { TenantService } from '../src/modules/db.module';
import { runSeed } from '../scripts/seed';

const testUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testUrl)('m17 account lifecycle integration', () => {
  let app: INestApplication;
  let tenants: TenantService;
  let handles: DbHandles;
  let shelterId: string;
  let staffCookie: string[];
  let cookie: string[];
  let userId: string;
  let animalId: string;
  let storageKey: string;

  const run = Date.now();
  const email = `m17-${run}@x.dev`;
  const password = 'Password123x';

  const http = () => request(app.getHttpServer());

  async function loginAs(userEmail: string, userPassword: string): Promise<string[]> {
    const login = await http()
      .post('/app/v1/auth/login')
      .send({ email: userEmail, password: userPassword });
    expect(login.status).toBe(200);
    return login.headers['set-cookie'];
  }

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
    const shelterRows = (await tenants.service(
      sql => sql`select id from shelters where slug = 'happytail' limit 1`,
    )) as unknown as { id: string }[];
    shelterId = shelterRows[0]!.id;

    staffCookie = await loginAs('dev@kithlink.dev', 'DevOnly123!x');

    const reg = await http()
      .post('/app/v1/auth/register')
      .send({ email, password });
    expect([200, 201]).toContain(reg.status);
    cookie = await loginAs(email, password);

    const userRows = (await tenants.service(
      sql => sql`select id from users where email = ${email} limit 1`,
    )) as unknown as { id: string }[];
    userId = userRows[0]!.id;

    const profile = await http().put('/app/v1/me/profile').set('Cookie', cookie).send({
      legalName: 'M17 Export User',
      displayName: 'm17exporter',
      phone: '+15550000017',
      address: '17 Lifecycle Way, Testville',
    });
    expect(profile.status).toBe(200);

    const created = await http()
      .post(`/admin/v1/shelters/${shelterId}/animals`)
      .set('Cookie', staffCookie)
      .send({ name: `M17Dog-${run}`, species: 'dog', traits: {} });
    expect(created.status).toBe(201);
    animalId = created.body.id as string;

    const fav = await http().put(`/app/v1/me/favorites/${animalId}`).set('Cookie', cookie);
    expect(fav.status).toBe(200);

    await tenants.service(async sql => {
      await sql`
        insert into applications (animal_id, shelter_id, applicant_id)
        select ${animalId}::uuid, ${shelterId}::uuid, ap.id
        from applicant_profiles ap
        where ap.user_id = ${userId}::uuid`;
      const artifactRows = (await sql`
        insert into artifacts (applicant_id, type, state)
        select ap.id, 'gov_id', 'uploaded'
        from applicant_profiles ap
        where ap.user_id = ${userId}::uuid
        returning id`) as unknown as { id: string }[];
      storageKey = `m17/${run}/gov-id.pdf`;
      await sql`
        insert into artifact_files (artifact_id, storage_key, edek_wrapped, sha256, mime, bytes, uploaded_by)
        values (${artifactRows[0]!.id}, ${storageKey}, 'wrapped-dek', 'deadbeef', 'application/pdf', 128, ${userId}::uuid)`;
    });
  }, 30000);

  afterAll(async () => {
    await app?.close();
    await handles?.sql.end({ timeout: 5 });
  });

  it('exports the account as a JSON attachment with decrypted profile and applications', async () => {
    const res = await http().get('/app/v1/me/export').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const disposition = res.headers['content-disposition'];
    expect(disposition).toContain('attachment');
    expect(disposition).toMatch(/kithlink-export-\d{4}-\d{2}-\d{2}\.json/);
    expect(res.body.profile.legalName).toBe('M17 Export User');
    expect(res.body.profile.address).toBe('17 Lifecycle Way, Testville');
    expect(res.body.profile.phone).toBe('+15550000017');
    expect(Array.isArray(res.body.applications)).toBe(true);
    expect(res.body.applications.length).toBeGreaterThanOrEqual(1);
    expect(res.body.applications[0].animal).toBe(`M17Dog-${run}`);
    expect(res.body.applications[0].shelter).toBeTruthy();
    expect(typeof res.body.applications[0].status).toBe('string');
    expect(res.body.applications[0].dates.created).toBeTruthy();
    expect(Array.isArray(res.body.favorites)).toBe(true);
    expect(res.body.favorites.some((f: { animalId: string }) => f.animalId === animalId)).toBe(true);
    expect(res.body.artifacts.length).toBeGreaterThanOrEqual(1);
    expect(res.body.artifacts[0]).toMatchObject({ type: 'gov_id', state: 'uploaded' });
    expect(Array.isArray(res.body.consents)).toBe(true);
  });

  it('rejects delete with a wrong password and keeps the account intact', async () => {
    const res = await http()
      .post('/app/v1/me/delete')
      .set('Cookie', cookie)
      .send({ password: 'WrongPass999x' });
    expect(res.status).toBe(403);
    const session = await http().get('/app/v1/auth/session').set('Cookie', cookie);
    expect(session.status).toBe(200);
  });

  it('deletes the account: tombstone, scrub, revoke, purge outbox row', async () => {
    const res = await http()
      .post('/app/v1/me/delete')
      .set('Cookie', cookie)
      .send({ password });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const login = await http().post('/app/v1/auth/login').send({ email, password });
    expect(login.status).toBe(401);

    const dbState = (await tenants.service(async sql => {
      const userRows = (await sql`
        select email, password_hash, totp_secret_enc, deleted_at
        from users where id = ${userId}::uuid`) as unknown as {
        email: string;
        password_hash: string | null;
        totp_secret_enc: string | null;
        deleted_at: Date | null;
      }[];
      const sessions = (await sql`
        select count(*)::int as n from sessions where user_id = ${userId}::uuid`) as unknown as {
        n: number;
      }[];
      const profiles = (await sql`
        select legal_name, display_name, phone, address_enc
        from applicant_profiles where user_id = ${userId}::uuid`) as unknown as {
        legal_name: string;
        display_name: string | null;
        phone: string | null;
        address_enc: string | null;
      }[];
      const favorites = (await sql`
        select count(*)::int as n from favorite_animals where user_id = ${userId}::uuid`) as unknown as {
        n: number;
      }[];
      const files = (await sql`
        select count(*)::int as n
        from artifact_files af
        join artifacts a on a.id = af.artifact_id
        join applicant_profiles ap on ap.id = a.applicant_id
        where ap.user_id = ${userId}::uuid`) as unknown as { n: number }[];
      const purges = (await sql`
        select payload_json
        from outbox_events
        where topic = 'account.artifact_purge'
          and payload_json->>'keys' like ${`%${storageKey}%`}
        order by created_at desc limit 1`) as unknown as {
        payload_json: { keys: string[] };
      }[];
      return { userRows, sessions, profiles, favorites, files, purges };
    }));

    expect(dbState.userRows[0]!.email).toBe(`deleted-${userId}@invalid`);
    expect(dbState.userRows[0]!.password_hash).toBeNull();
    expect(dbState.userRows[0]!.totp_secret_enc).toBeNull();
    expect(dbState.userRows[0]!.deleted_at).not.toBeNull();

    expect(dbState.sessions[0]!.n).toBe(0);

    expect(dbState.profiles[0]!.legal_name).toBe('[deleted]');
    expect(dbState.profiles[0]!.display_name).toBeNull();
    expect(dbState.profiles[0]!.phone).toBeNull();
    expect(dbState.profiles[0]!.address_enc).toBeNull();

    expect(dbState.favorites[0]!.n).toBe(0);

    expect(dbState.files[0]!.n).toBeGreaterThanOrEqual(1);
    expect(dbState.purges.length).toBeGreaterThanOrEqual(1);
    expect(dbState.purges[0]!.payload_json.keys).toContain(storageKey);
  });

  it('rejects a second delete for the tombstoned account', async () => {
    const res = await http()
      .post('/app/v1/me/delete')
      .set('Cookie', cookie)
      .send({ password });
    expect([401, 404]).toContain(res.status);
  });
});
