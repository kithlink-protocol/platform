import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { createDb, type DbHandles } from '@kithlink/db';
import { upsertFosterHomeSchema } from '@kithlink/contracts';
import { AppModule } from '../src/app.module';
import { ProblemFilter } from '../src/common/http-exception.filter';
import { runFosterSweep } from '../src/modules/fosters/fosters.service';
import { TenantService } from '../src/modules/db.module';
import { OutboxService } from '../src/modules/notifications/notifications.module';
import { runSeed } from '../scripts/seed';

describe('foster contract bounds (unit)', () => {
  const base = {
    homeName: 'River Street Foster',
    primaryContactEmail: 'river@example.com',
    capacity: 2,
  };

  it('rejects skill values outside the enum', () => {
    expect(() =>
      upsertFosterHomeSchema.parse({ ...base, skills: ['bogus'] }),
    ).toThrow();
    const parsed = upsertFosterHomeSchema.parse({
      ...base,
      skills: ['neonatal', 'behavior'],
    });
    expect(parsed.skills).toEqual(['neonatal', 'behavior']);
    expect(parsed.active).toBe(true);
  });

  it('bounds capacity between 1 and 20', () => {
    expect(() => upsertFosterHomeSchema.parse({ ...base, capacity: 0 })).toThrow();
    expect(() => upsertFosterHomeSchema.parse({ ...base, capacity: 21 })).toThrow();
    expect(upsertFosterHomeSchema.parse({ ...base, capacity: 1 }).capacity).toBe(1);
    expect(upsertFosterHomeSchema.parse({ ...base, capacity: 20 }).capacity).toBe(20);
  });
});

const testUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testUrl)('m8 foster integration', () => {
  let app: INestApplication;
  let tenants: TenantService;
  let handles: DbHandles;
  let shelterId: string;
  let devCookie: string[];

  let homeId: string;
  let homeEmail: string;
  let animalId: string;
  let placementId: string;

  const run = Date.now();

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
  const fostersBase = () => `/admin/v1/shelters/${shelterId}/fosters`;

  function checkInKey(homeIdValue: string, animalIdValue: string, startedAtIso: string): string {
    return createHash('sha256')
      .update(`${homeIdValue}${animalIdValue}${startedAtIso.slice(0, 10)}`)
      .digest('hex');
  }

  it('creates, lists, and patches a foster home', async () => {
    homeEmail = `foster-${run}@x.dev`;
    const created = await http()
      .post(`${fostersBase()}/homes`)
      .set('Cookie', devCookie)
      .send({
        homeName: `River ${run}`,
        primaryContactEmail: homeEmail,
        capacity: 2,
        skills: ['neonatal'],
      });
    expect(created.status).toBe(201);
    expect(created.body.active).toBe(true);
    expect(created.body.currentPlacements).toBe(0);
    homeId = created.body.id;

    const list = await http().get(`${fostersBase()}/homes`).set('Cookie', devCookie);
    expect(list.status).toBe(200);
    const row = list.body.items.find((h: { id: string }) => h.id === homeId);
    expect(row).toBeTruthy();
    expect(row.homeName).toBe(`River ${run}`);

    const patched = await http()
      .patch(`${fostersBase()}/homes/${homeId}`)
      .set('Cookie', devCookie)
      .send({
        homeName: `River ${run}`,
        primaryContactEmail: homeEmail,
        capacity: 3,
        skills: [],
        active: false,
      });
    expect(patched.status).toBe(200);
    expect(patched.body.capacity).toBe(3);
    expect(patched.body.active).toBe(false);

    const reopened = await http()
      .patch(`${fostersBase()}/homes/${homeId}`)
      .set('Cookie', devCookie)
      .send({
        homeName: `River ${run}`,
        primaryContactEmail: homeEmail,
        capacity: 3,
        skills: [],
        active: true,
      });
    expect(reopened.status).toBe(200);
    expect(reopened.body.active).toBe(true);
  });

  it('places an available animal and sets next check-in about 7 days out', async () => {
    const created = await http()
      .post(`/admin/v1/shelters/${shelterId}/animals`)
      .set('Cookie', devCookie)
      .send({ name: `FosterPet-${run}`, species: 'dog' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('available');
    animalId = created.body.id;

    const placed = await http()
      .post(`${fostersBase()}/placements`)
      .set('Cookie', devCookie)
      .send({ homeId, animalId });
    if (placed.status !== 201) {
      console.log('PLACE_DBG', placed.status, JSON.stringify(placed.body), { homeId, animalId });
    }
    expect(placed.status).toBe(201);
    expect(placed.body.status).toBe('active');
    expect(placed.body.animalName).toBe(`FosterPet-${run}`);
    placementId = placed.body.id;

    const startedAt = new Date(placed.body.startedAt).getTime();
    const nextCheckIn = new Date(placed.body.nextCheckIn).getTime();
    const days = (nextCheckIn - startedAt) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('refuses placements for animals that are not available or draft', async () => {
    const created = await http()
      .post(`/admin/v1/shelters/${shelterId}/animals`)
      .set('Cookie', devCookie)
      .send({ name: `Adopted-${run}`, species: 'dog', status: 'adopted' });
    expect(created.status).toBe(201);
    const refused = await http()
      .post(`${fostersBase()}/placements`)
      .set('Cookie', devCookie)
      .send({ homeId, animalId: created.body.id });
    expect(refused.status).toBe(409);
  });

  it('sweep sends the check-in email exactly once for a backdated placement', async () => {
    await tenants.service(
      sql =>
        sql`update foster_placements set next_check_in = now() - interval '1 hour'
            where id = ${placementId}::uuid`,
    );

    const countBefore = (await tenants.service(
      sql =>
        sql`select count(*)::int as n from outbox_events where topic = 'foster.checkin'`,
    )) as unknown as { n: number }[];

    const sentFirst = await runFosterSweep(tenants, app.get(OutboxService));
    expect(sentFirst).toBe(1);

    const flagged = (await tenants.service(async sql => {
      return sql`select checkin_1_sent from foster_placements where id = ${placementId}::uuid`;
    })) as unknown as { checkin_1_sent: boolean }[];
    expect(flagged[0]?.checkin_1_sent).toBe(true);

    const sentSecond = await runFosterSweep(tenants, app.get(OutboxService));
    expect(sentSecond).toBe(0);

    const mails = (await tenants.service(async sql => {
      return sql`select payload_json from outbox_events
                 where topic = 'foster.checkin' order by created_at desc limit 1`;
    })) as unknown as { payload_json: { to: string[]; subject: string; url: string } }[];
    expect(mails[0]?.payload_json.to).toContain(homeEmail);
    expect(mails[0]?.payload_json.subject).toBe(
      'How is everyone doing? A quick update on your foster pet',
    );
    expect(mails[0]?.payload_json.url).toContain('/foster-checkin?fp=');

    const countAfter = (await tenants.service(
      sql =>
        sql`select count(*)::int as n from outbox_events where topic = 'foster.checkin'`,
    )) as unknown as { n: number }[];
    expect(countAfter[0]!.n - countBefore[0]!.n).toBe(1);
  });

  it('public check-in rejects a wrong key and accepts the correct one', async () => {
    const wrongKey = 'a'.repeat(64);
    const bad = await http()
      .get('/public/v1/foster-checkin')
      .query({ fp: placementId, k: wrongKey });
    expect([400, 404]).toContain(bad.status);

    const placementRows = (await tenants.service(async sql => {
      return sql`select home_id, animal_id, started_at from foster_placements
                 where id = ${placementId}::uuid`;
    })) as unknown as { home_id: string; animal_id: string; started_at: Date }[];
    const key = checkInKey(
      placementRows[0]!.home_id,
      placementRows[0]!.animal_id,
      new Date(placementRows[0]!.started_at).toISOString(),
    );

    const good = await http()
      .get('/public/v1/foster-checkin')
      .query({ fp: placementId, k: key });
    expect(good.status).toBe(200);
    expect(good.body.animalName).toBe(`FosterPet-${run}`);
    expect(typeof good.body.homeName).toBe('string');
  });

  it('public check-in submit records an update visible to staff', async () => {
    const placementRows = (await tenants.service(async sql => {
      return sql`select home_id, animal_id, started_at from foster_placements
                 where id = ${placementId}::uuid`;
    })) as unknown as { home_id: string; animal_id: string; started_at: Date }[];
    const key = checkInKey(
      placementRows[0]!.home_id,
      placementRows[0]!.animal_id,
      new Date(placementRows[0]!.started_at).toISOString(),
    );

    const submitted = await http().post('/public/v1/foster-checkin').send({
      fp: placementId,
      k: key,
      notes: 'Eating well, sleeping through the night.',
      concerns: false,
    });
    expect(submitted.status).toBe(201);

    const updates = await http()
      .get(`${fostersBase()}/placements/${placementId}/updates`)
      .set('Cookie', devCookie);
    expect(updates.status).toBe(200);
    const match = updates.body.items.find(
      (u: { notes: string }) => u.notes === 'Eating well, sleeping through the night.',
    );
    expect(match).toBeTruthy();
  });

  it('closes an active placement once, then conflicts', async () => {
    const closed = await http()
      .post(`${fostersBase()}/placements/${placementId}/close`)
      .set('Cookie', devCookie);
    if (closed.status !== 200) console.log('CLOSE_DBG', closed.status, JSON.stringify(closed.body), { placementId });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('closed');

    const again = await http()
      .post(`${fostersBase()}/placements/${placementId}/close`)
      .set('Cookie', devCookie);
    expect(again.status).toBe(409);

    const activeList = await http()
      .get(`${fostersBase()}/placements?status=active`)
      .set('Cookie', devCookie);
    expect(activeList.status).toBe(200);
    expect(
      activeList.body.items.find((p: { id: string }) => p.id === placementId),
    ).toBeUndefined();
  });

  it('blocks cross-tenant staff consistently with the guards', async () => {
    const bEmail = `cross-b-${run}@x.dev`;
    const otherSlug = `other-rescue-foster-${run}`;
    await http().post('/app/v1/auth/register').send({ email: bEmail, password: 'Password123x' });
    await tenants.service(async sql => {
      const rows = (await sql`
        insert into shelters (slug, name) values (${otherSlug}, 'Other Rescue Foster')
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

    const homeAttempt = await http()
      .post(`${fostersBase()}/homes`)
      .set('Cookie', bCookie)
      .send({ homeName: `Rogue ${run}`, primaryContactEmail: `rogue-${run}@x.dev`, capacity: 2 });
    expect(homeAttempt.status).toBe(403);

    const listAttempt = await http()
      .get(`${fostersBase()}/homes`)
      .set('Cookie', bCookie);
    expect(listAttempt.status).toBe(403);

    const placementAttempt = await http()
      .post(`${fostersBase()}/placements`)
      .set('Cookie', bCookie)
      .send({ homeId, animalId });
    expect(placementAttempt.status).toBe(403);
  });
});
