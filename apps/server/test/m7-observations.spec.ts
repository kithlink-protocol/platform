import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { createDb, type DbHandles } from '@kithlink/db';
import { addObservationSchema, type BehaviorObservation } from '@kithlink/contracts';
import { AppModule } from '../src/app.module';
import { ProblemFilter } from '../src/common/http-exception.filter';
import { TenantService } from '../src/modules/db.module';
import { runSeed } from '../scripts/seed';

const testUrl = process.env.TEST_DATABASE_URL;

describe('m7 observation schema (unit)', () => {
  it('accepts fas-only, note-only, and combined entries', () => {
    expect(addObservationSchema.safeParse({ fasScore: 2 }).success).toBe(true);
    expect(addObservationSchema.safeParse({ note: 'slept through the visit' }).success).toBe(true);
    expect(
      addObservationSchema.safeParse({ fasScore: 0, tags: ['calm'], note: 'loose body' }).success,
    ).toBe(true);
    expect(addObservationSchema.safeParse({}).success).toBe(false);
    expect(addObservationSchema.safeParse({ fasScore: null, note: '' }).success).toBe(false);
    expect(addObservationSchema.safeParse({ note: null }).success).toBe(false);
  });

  it('rejects out-of-range scores and more than four tags', () => {
    expect(addObservationSchema.safeParse({ fasScore: 5 }).success).toBe(false);
    expect(addObservationSchema.safeParse({ fasScore: -1 }).success).toBe(false);
    expect(
      addObservationSchema.safeParse({
        fasScore: 1,
        tags: ['calm', 'playful', 'curious', 'vocal', 'snuggly'],
      }).success,
    ).toBe(false);
    expect(addObservationSchema.safeParse({ note: 'x'.repeat(1001) }).success).toBe(false);
    expect(addObservationSchema.safeParse({ tags: ['bites'] }).success).toBe(false);
  });
});

describe.skipIf(!testUrl)('m7 observations integration', () => {
  let app: INestApplication;
  let tenants: TenantService;
  let handles: DbHandles;
  let shelterId: string;
  let staffCookie: string[];
  let animalId: string;

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
    const rows = (await tenants.service(async sql => {
      return sql`select id from shelters where slug = 'happytail' limit 1`;
    })) as unknown as { id: string }[];
    shelterId = rows[0]!.id;
    const login = await request(app.getHttpServer())
      .post('/app/v1/auth/login')
      .send({ email: 'dev@kithlink.dev', password: 'DevOnly123!x' });
    expect(login.status).toBe(200);
    staffCookie = login.headers['set-cookie'];
  }, 30000);

  afterAll(async () => {
    await app?.close();
    await handles?.sql.end({ timeout: 5 });
  });

  const http = () => request(app.getHttpServer());

  const obsUrl = (animal: string) =>
    `/admin/v1/shelters/${shelterId}/animals/${animal}/observations`;

  beforeAll(async () => {
    const created = await http()
      .post(`/admin/v1/shelters/${shelterId}/animals`)
      .set('Cookie', staffCookie)
      .send({ name: `M7Timeline-${Date.now()}`, species: 'dog' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('available');
    animalId = created.body.id;
  }, 15000);

  it('staff adds an observation and the staff list returns it newest first', async () => {
    const first = await http().post(obsUrl(animalId)).set('Cookie', staffCookie).send({
      fasScore: 3,
      tags: ['reactive', 'vocal'],
      note: 'barked at skateboard',
    });
    expect(first.status).toBe(201);
    expect(first.body.fasScore).toBe(3);
    expect(first.body.tags).toEqual(['reactive', 'vocal']);
    await new Promise(resolve => setTimeout(resolve, 20));
    const second = await http().post(obsUrl(animalId)).set('Cookie', staffCookie).send({
      fasScore: 1,
      tags: ['calm'],
      note: 'settled quickly',
    });
    expect(second.status).toBe(201);

    const list = await http().get(obsUrl(animalId)).set('Cookie', staffCookie);
    expect(list.status).toBe(200);
    const items: BehaviorObservation[] = list.body.items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0]!.note).toBe('settled quickly');
    expect(items.map(o => o.note)).toContain('barked at skateboard');
  });

  it('public detail for an available animal includes observations without author identity', async () => {
    const detail = await http().get(`/public/v1/animals/${animalId}`);
    expect(detail.status).toBe(200);
    const observations: BehaviorObservation[] = detail.body.observations;
    expect(Array.isArray(observations)).toBe(true);
    expect(observations.length).toBeGreaterThan(0);
    for (const observation of observations) {
      expect(Object.keys(observation).sort()).toEqual(['createdAt', 'fasScore', 'id', 'note', 'tags']);
      expect(JSON.stringify(observation).toLowerCase()).not.toContain('author');
    }
    // Public payload is capped at 20, newest first.
    expect(observations.length).toBeLessThanOrEqual(20);
    const dates = observations.map(o => o.createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('hides an adopted animal and its observations from anon with a 404', async () => {
    const created = await http()
      .post(`/admin/v1/shelters/${shelterId}/animals`)
      .set('Cookie', staffCookie)
      .send({ name: `M7Adopted-${Date.now()}`, species: 'cat' });
    const adoptedId = created.body.id as string;
    const added = await http()
      .post(obsUrl(adoptedId))
      .set('Cookie', staffCookie)
      .send({ fasScore: 0, note: 'purring' });
    expect(added.status).toBe(201);

    const patched = await http()
      .patch(`/admin/v1/shelters/${shelterId}/animals/${adoptedId}`)
      .set('Cookie', staffCookie)
      .send({ status: 'adopted' });
    expect(patched.status).toBe(200);

    const detail = await http().get(`/public/v1/animals/${adoptedId}`);
    expect(detail.status).toBe(404);

    // Staff still see the timeline for their own adopted animal.
    const staffList = await http().get(obsUrl(adoptedId)).set('Cookie', staffCookie);
    expect(staffList.status).toBe(200);
    expect(staffList.body.items.some((o: BehaviorObservation) => o.note === 'purring')).toBe(true);
  });

  it('blocks cross-tenant staffB from both observation routes with 404', async () => {
    const bEmail = `m7-staff-b-${Date.now()}@x.dev`;
    await http().post('/app/v1/auth/register').send({ email: bEmail, password: 'Password123x' });
    const bShelterId = (await tenants.service(async sql => {
      const rows = (await sql`
        insert into shelters (slug, name) values (${'m7-shelter-b-' + Date.now()}, 'M7 Shelter B')
        returning id`) as unknown as { id: string }[];
      await sql`
        insert into staff_members (shelter_id, user_id, role)
        select ${rows[0]!.id}, u.id, 'owner'
        from users u
        where u.email = ${bEmail}`;
      return rows[0]!.id;
    })) as string;
    const bLogin = await http()
      .post('/app/v1/auth/login')
      .send({ email: bEmail, password: 'Password123x' });
    expect(bLogin.status).toBe(200);
    const bCookie = bLogin.headers['set-cookie'];

    const postAttempt = await http()
      .post(`/admin/v1/shelters/${shelterId}/animals/${animalId}/observations`)
      .set('Cookie', bCookie)
      .send({ fasScore: 2, note: 'cross-tenant probe' });
    expect(postAttempt.status).toBe(403);

    const listAttempt = await http()
      .get(`/admin/v1/shelters/${shelterId}/animals/${animalId}/observations`)
      .set('Cookie', bCookie);
    expect(listAttempt.status).toBe(403);

    // And B's own scoped route stays functional (empty timeline on a fresh animal).
    const ownAnimal = await http()
      .post(`/admin/v1/shelters/${bShelterId}/animals`)
      .set('Cookie', bCookie)
      .send({ name: `M7OwnB-${Date.now()}`, species: 'dog' });
    expect(ownAnimal.status).toBe(201);
    const ownList = await http()
      .get(`/admin/v1/shelters/${bShelterId}/animals/${ownAnimal.body.id}/observations`)
      .set('Cookie', bCookie);
    expect(ownList.status).toBe(200);
    expect(ownList.body.items).toEqual([]);
  });

  it('accepts a note-only entry', async () => {
    const res = await http()
      .post(obsUrl(animalId))
      .set('Cookie', staffCookie)
      .send({ tags: ['snuggly'], note: 'leaned into every pet' });
    expect(res.status).toBe(201);
    expect(res.body.fasScore).toBeNull();
    expect(res.body.tags).toEqual(['snuggly']);
  });

  it('rejects an entry with neither score nor note with 400', async () => {
    const res = await http().post(obsUrl(animalId)).set('Cookie', staffCookie).send({ tags: ['calm'] });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('records an observation.added audit row', async () => {
    const rows = (await tenants.service(async sql => {
      return sql`select count(*)::int as n from audit_logs where action = 'observation.added'`;
    })) as unknown as { n: number }[];
    expect(rows[0]!.n).toBeGreaterThan(0);
  });
});
