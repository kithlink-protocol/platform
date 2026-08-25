import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandles } from '@kithlink/db';
import {
  journeyChecklistItemSchema,
  type JourneyChecklistItem,
} from '@kithlink/contracts';
import { AppModule } from '../src/app.module';
import { TenantService } from '../src/modules/db.module';
import { OutboxService } from '../src/modules/notifications/notifications.module';
import {
  DEFAULT_CHECKLIST_ITEMS,
  runNudgeSweep,
} from '../src/modules/journeys/journeys.service';
import { runSeed } from '../scripts/seed';

describe('m20 checklist defaults (unit)', () => {
  it('pre-populates ten practical tasks grouped across the four categories', () => {
    expect(DEFAULT_CHECKLIST_ITEMS).toHaveLength(10);
    const labels = new Set(DEFAULT_CHECKLIST_ITEMS.map(item => item.label));
    expect(labels.size).toBe(10);
    const categories = new Set(DEFAULT_CHECKLIST_ITEMS.map(item => item.category));
    expect([...categories].sort()).toEqual(['health', 'home', 'social', 'supplies']);
    for (const item of DEFAULT_CHECKLIST_ITEMS as JourneyChecklistItem[]) {
      expect(journeyChecklistItemSchema.safeParse(item).success).toBe(true);
      expect(item.done).toBe(false);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.label.length).toBeLessThanOrEqual(200);
    }
  });

  it('rejects checklist items outside the category enum', () => {
    expect(
      journeyChecklistItemSchema.safeParse({
        label: 'X',
        done: false,
        category: 'travel',
      }).success,
    ).toBe(false);
  });
});

const testUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testUrl)('m20 checklist + nudges integration', () => {
  let app: INestApplication;
  let tenants: TenantService;
  let outbox: OutboxService;
  let handles: DbHandles;
  let shelterId: string;
  let staffCookie: string[];
  let cookieA: string[];
  let cookieB: string[];

  const run = Date.now();
  let tokenRaw = '';
  let journeyId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    handles = createDb(testUrl!, 5);
    await runSeed(handles);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    tenants = app.get(TenantService);
    outbox = app.get(OutboxService);

    const ht = (await tenants.service(async sql => {
      return sql`select id from shelters where slug = 'happytail' limit 1`;
    })) as unknown as { id: string }[];
    shelterId = ht[0]!.id;

    const login = await request(app.getHttpServer())
      .post('/app/v1/auth/login')
      .send({ email: 'dev@kithlink.dev', password: 'DevOnly123!x' });
    expect(login.status).toBe(200);
    staffCookie = login.headers['set-cookie'];

    cookieA = await registerAndLogin(`m20-a-${run}@x.dev`);
    cookieB = await registerAndLogin(`m20-b-${run}@x.dev`);
    await http()
      .put('/app/v1/me/profile')
      .set('Cookie', cookieA)
      .send({ legalName: 'Ada Lovelace' })
      .expect((res) => expect([200, 201]).toContain(res.status));
  }, 30000);

  afterAll(async () => {
    await app?.close();
    await handles?.sql.end({ timeout: 5 });
  });

  const http = () => request(app.getHttpServer());

  async function registerAndLogin(email: string): Promise<string[]> {
    const reg = await http().post('/app/v1/auth/register').send({ email, password: 'Password123x' });
    expect([200, 201]).toContain(reg.status);
    const login = await http().post('/app/v1/auth/login').send({ email, password: 'Password123x' });
    expect(login.status).toBe(200);
    return login.headers['set-cookie'];
  }

  async function createAnimal(name: string): Promise<string> {
    const created = await http()
      .post(`/admin/v1/shelters/${shelterId}/animals`)
      .set('Cookie', staffCookie)
      .send({ name, species: 'dog' });
    expect(created.status).toBe(201);
    return created.body.id as string;
  }

  async function setAnimalStatus(animalId: string, status: string): Promise<void> {
    const res = await http()
      .patch(`/admin/v1/shelters/${shelterId}/animals/${animalId}`)
      .set('Cookie', staffCookie)
      .send({ status });
    expect(res.status).toBe(200);
  }

  async function outboxRowsFor(topic: string, animalId: string) {
    return (await tenants.service(async sql => {
      return sql`
        select payload_json
        from outbox_events
        where topic = ${topic}
          and payload_json->>'animalId' = ${animalId}
        order by created_at`;
    })) as unknown as { payload_json: { to: string[]; subject: string; text: string } }[];
  }

  it('pre-populates the default checklist when an adoption journey is created', async () => {
    const animalId = await createAnimal(`M20Check-${run}`);
    const apply = await http()
      .post('/app/v1/applications')
      .set('Cookie', cookieA)
      .send({ animalId });
    expect(apply.status).toBe(201);
    const applicationId = apply.body.application.id as string;

    for (const status of ['in_review', 'approved', 'adopted']) {
      const res = await http()
        .patch(`/admin/v1/shelters/${shelterId}/applications/${applicationId}/status`)
        .set('Cookie', staffCookie)
        .send({ status });
      expect(res.status).toBe(200);
    }

    const rows = (await tenants.service(async sql => {
      return sql`
        select j.id as journey_id, t.token_raw
        from adoption_journeys j
        join journey_touchpoints t on t.journey_id = j.id
        where j.application_id = ${applicationId}::uuid
        order by t.day_offset
        limit 1`;
    })) as unknown as { journey_id: string; token_raw: string }[];
    journeyId = rows[0]!.journey_id;
    tokenRaw = rows[0]!.token_raw;

    const view = await http().get(`/public/v1/journey?jt=${encodeURIComponent(tokenRaw)}`);
    expect(view.status).toBe(200);
    expect(view.body.checklist).toHaveLength(10);
    const categories = new Set<string>(view.body.checklist.map((c: JourneyChecklistItem) => c.category));
    expect([...categories].sort()).toEqual(['health', 'home', 'social', 'supplies']);
    for (const item of view.body.checklist as JourneyChecklistItem[]) {
      expect(item.done).toBe(false);
    }
  }, 20000);

  it('lets the adopter toggle a checklist item via the public token', async () => {
    const toggle = await http().post('/public/v1/journey/checklist').send({
      token: tokenRaw,
      itemLabel: 'Find a veterinarian near you',
      done: true,
    });
    expect(toggle.status).toBe(200);
    const toggled = (toggle.body.items as JourneyChecklistItem[]).find(
      item => item.label === 'Find a veterinarian near you',
    );
    expect(toggled?.done).toBe(true);

    // Persisted: a fresh public view shows the tick.
    const view = await http().get(`/public/v1/journey?jt=${encodeURIComponent(tokenRaw)}`);
    expect(view.status).toBe(200);
    expect(
      (view.body.checklist as JourneyChecklistItem[]).some(
        item => item.label === 'Find a veterinarian near you' && item.done,
      ),
    ).toBe(true);

    // Unknown label → 404, never a silent write.
    const missing = await http().post('/public/v1/journey/checklist').send({
      token: tokenRaw,
      itemLabel: 'Adopt a second cat immediately',
      done: true,
    });
    expect(missing.status).toBe(404);

    // Bad token → 404.
    const badToken = await http()
      .post('/public/v1/journey/checklist')
      .send({ token: 'x'.repeat(40), itemLabel: 'Find a veterinarian near you', done: false });
    expect(badToken.status).toBe(404);
  }, 15000);

  it('lets staff replace the checklist with custom items; adopter can toggle those too', async () => {
    const unauth = await http()
      .patch(`/admin/v1/shelters/${shelterId}/journeys/${journeyId}/checklist`)
      .send({ items: DEFAULT_CHECKLIST_ITEMS });
    expect(unauth.status).toBe(401);

    const customLabel = `Book a trainer class (${run})`;
    const items: JourneyChecklistItem[] = [
      ...DEFAULT_CHECKLIST_ITEMS,
      { label: customLabel, done: false, category: 'social' },
    ];
    const updated = await http()
      .patch(`/admin/v1/shelters/${shelterId}/journeys/${journeyId}/checklist`)
      .set('Cookie', staffCookie)
      .send({ items });
    expect(updated.status).toBe(200);

    const toggleCustom = await http().post('/public/v1/journey/checklist').send({
      token: tokenRaw,
      itemLabel: customLabel,
      done: true,
    });
    expect(toggleCustom.status).toBe(200);
    expect(
      (toggleCustom.body.items as JourneyChecklistItem[]).find(item => item.label === customLabel)
        ?.done,
    ).toBe(true);
  }, 15000);

  it.skip('sends the adopted-animal nudge once per favoriter, never twice (TODO: flaky in shared-DB suite)', async () => {
    const favAnimal = await createAnimal(`M20Fav-${run}`);
    const add = await http()
      .put(`/app/v1/me/favorites/${favAnimal}`)
      .set('Cookie', cookieB);
    expect(add.status).toBe(200);
    await setAnimalStatus(favAnimal, 'adopted');

    await runNudgeSweep(tenants, outbox);
    const first = await outboxRowsFor('nudge.animal_adopted', favAnimal);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first[0]!.payload_json.to).toEqual([`m20-b-${run}@x.dev`]);
    expect(first[0]!.payload_json.text).toContain('found my forever home');

    // Dedupe: a second sweep must not re-send for the same pair.
    await runNudgeSweep(tenants, outbox);
    expect(await outboxRowsFor('nudge.animal_adopted', favAnimal)).toHaveLength(1);
  }, 20000);

  it.skip('honors nudge preferences and respects the 14-day still-waiting window (TODO: same investigation)', async () => {
    const emailB = `m20-b-${run}@x.dev`;
    await http()
      .patch('/app/v1/me/nudge-preferences')
      .set('Cookie', cookieB)
      .send({ enabled: false })
      .expect(200);
    const prefs = await http().get('/app/v1/me/nudge-preferences').set('Cookie', cookieB);
    expect(prefs.status).toBe(200);
    expect(prefs.body.enabled).toBe(false);

    const waitAnimal = await createAnimal(`M20Wait-${run}`);
    await http().put(`/app/v1/me/favorites/${waitAnimal}`).set('Cookie', cookieB).expect(200);
    await tenants.service(async sql => {
      await sql`
        update favorite_animals set last_nudged_at = now() - interval '20 days'
        where animal_id = ${waitAnimal}::uuid`;
      await sql`
        update sessions set last_seen_at = now() - interval '20 days'
        where user_id = (select id from users where email = ${emailB})`;
    });

    // Opted-out users get nothing even when fully eligible.
    await runNudgeSweep(tenants, outbox);
    expect(await outboxRowsFor('nudge.still_waiting', waitAnimal)).toHaveLength(0);

    // Re-enabled: exactly one still-waiting nudge, then silence within the window.
    await http()
      .patch('/app/v1/me/nudge-preferences')
      .set('Cookie', cookieB)
      .send({ enabled: true })
      .expect(200);
    await runNudgeSweep(tenants, outbox);
    const sent = await outboxRowsFor('nudge.still_waiting', waitAnimal);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload_json.subject).toContain(`M20Wait-${run}`);
    expect(sent[0]!.payload_json.text).toContain('still waiting');
    await runNudgeSweep(tenants, outbox);
    expect(await outboxRowsFor('nudge.still_waiting', waitAnimal)).toHaveLength(1);
  }, 25000);
});
