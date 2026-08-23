import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { createDb, type DbHandles } from '@kithlink/db';
import {
  saveChecklistStateSchema,
  saveReviewChecklistSchema,
} from '@kithlink/contracts';
import { AppModule } from '../src/app.module';
import { ProblemFilter } from '../src/common/http-exception.filter';
import { TenantService } from '../src/modules/db.module';
import { runSeed } from '../scripts/seed';

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

describe.skipIf(!testUrl)('m6 review checklist + placement velocity', () => {
  let app: INestApplication;
  let tenants: TenantService;
  let handles: DbHandles;
  let shelterId: string;
  let shelterBId: string;
  let ownerCookie: string[];
  let staffBCookie: string[];
  let applicationId: string;

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
  }, 30000);

  afterAll(async () => {
    await app?.close();
    await handles?.sql.end({ timeout: 5 });
  });

  const http = () => request(app.getHttpServer());

  const loginAndGetCookie = async (email: string, password: string): Promise<string[]> => {
    const res = await http().post('/app/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.headers['set-cookie'];
  };

  const registerStaff = async (email: string, role: string, targetShelterId: string): Promise<string[]> => {
    await http().post('/app/v1/auth/register').send({ email, password: 'Password123x' });
    await tenants.service(async sql => {
      const users = (await sql`select id from users where email = ${email} limit 1`) as unknown as {
        id: string;
      }[];
      await sql`
        insert into staff_members (shelter_id, user_id, role)
        values (${targetShelterId}::uuid, ${users[0]!.id}::uuid, ${role}::staff_role)
        on conflict (shelter_id, user_id) do update set role = ${role}::staff_role`;
    });
    return loginAndGetCookie(email, 'Password123x');
  };

  it('seeds shelters and logs in the owner', async () => {
    await runSeed(handles);
    const rows = (await tenants.service(
      sql => sql`select id from shelters where slug = 'happytail'`,
    )) as unknown as { id: string }[];
    shelterId = rows[0]!.id;
    ownerCookie = await loginAndGetCookie('dev@kithlink.dev', 'DevOnly123!x');
    expect(shelterId).toBeTruthy();

    const createdB = (await tenants.service(async sql => {
      const rows2 = (await sql`
        insert into shelters (name, slug) values ('Second Haven', 'second-haven-m6')
        on conflict (slug) do update set name = excluded.name
        returning id`) as unknown as { id: string }[];
      return rows2[0]!.id;
    })) as unknown as string;
    shelterBId = createdB;
  });

  it('PUT review-checklist replaces all items and GET returns them ordered', async () => {
    const put = await http()
      .put(`/admin/v1/shelters/${shelterId}/review-checklist`)
      .set('Cookie', ownerCookie)
      .send({ labels: ['Home check done', 'Landlord called', 'ID verified'] });
    expect(put.status).toBe(200);
    expect(put.body.items.map((i: { label: string }) => i.label)).toEqual([
      'Home check done',
      'Landlord called',
      'ID verified',
    ]);
    expect(put.body.items.map((i: { position: number }) => i.position)).toEqual([0, 1, 2]);
    expect(put.body.state).toEqual([]);

    const get = await http()
      .get(`/admin/v1/shelters/${shelterId}/review-checklist`)
      .set('Cookie', ownerCookie);
    expect(get.status).toBe(200);
    expect(get.body.items).toHaveLength(3);
  });

  it('second PUT keeps the shared item id and removes dropped labels', async () => {
    const before = await http()
      .get(`/admin/v1/shelters/${shelterId}/review-checklist`)
      .set('Cookie', ownerCookie);
    const sharedBefore = before.body.items.find(
      (i: { label: string }) => i.label === 'Landlord called',
    );

    const put = await http()
      .put(`/admin/v1/shelters/${shelterId}/review-checklist`)
      .set('Cookie', ownerCookie)
      .send({ labels: ['Landlord called', 'Home check round two'] });
    expect(put.status).toBe(200);
    expect(put.body.items).toHaveLength(2);
    const sharedAfter = put.body.items.find(
      (i: { label: string }) => i.label === 'Landlord called',
    );
    expect(sharedAfter.id).toBe(sharedBefore.id);
  });

  it('seeds an animal + application via direct SQL', async () => {
    const seeded = (await tenants.service(async sql => {
      const animal = (await sql`
        insert into animals (shelter_id, name, species, status)
        values (${shelterId}::uuid, 'Checklist-Pet', 'dog', 'available') returning id`) as unknown as {
        id: string;
      }[];
      const user = (await sql`
        insert into users (email) values (${'m6-applicant-' + Date.now() + '@x.dev'}) returning id`) as unknown as {
        id: string;
      }[];
      const profile = (await sql`
        insert into applicant_profiles (user_id, legal_name)
        values (${user[0]!.id}::uuid, 'M6 Applicant') returning id`) as unknown as {
        id: string;
      }[];
      const appRow = (await sql`
        insert into applications (animal_id, shelter_id, applicant_id, status, submitted_at)
        values (${animal[0]!.id}::uuid, ${shelterId}::uuid, ${profile[0]!.id}::uuid, 'submitted', now())
        returning id`) as unknown as { id: string }[];
      return appRow[0]!.id;
    })) as unknown as string;
    applicationId = seeded;
    expect(applicationId).toBeTruthy();
  });

  it('application checklist GET defaults to false and PUT state persists', async () => {
    const itemsRes = await http()
      .get(`/admin/v1/shelters/${shelterId}/review-checklist`)
      .set('Cookie', ownerCookie);
    const items = itemsRes.body.items as { id: string; label: string; position: number }[];

    const initial = await http()
      .get(`/admin/v1/shelters/${shelterId}/applications/${applicationId}/checklist`)
      .set('Cookie', ownerCookie);
    expect(initial.status).toBe(200);
    expect(initial.body.items.map((i: { id: string }) => i.id)).toEqual(items.map(i => i.id));
    expect(initial.body.state.every((s: { checked: boolean }) => s.checked === false)).toBe(true);

    const putState = await http()
      .put(`/admin/v1/shelters/${shelterId}/applications/${applicationId}/checklist`)
      .set('Cookie', ownerCookie)
      .send({
        entries: [
          { itemId: items[0]!.id, checked: true },
          { itemId: items[1]!.id, checked: true },
        ],
      });
    expect(putState.status).toBe(200);
    const byId = new Map(putState.body.state.map((s: { itemId: string; checked: boolean }) => [s.itemId, s.checked]));
    expect(byId.get(items[0]!.id)).toBe(true);
    expect(byId.get(items[1]!.id)).toBe(true);

    const refetched = await http()
      .get(`/admin/v1/shelters/${shelterId}/applications/${applicationId}/checklist`)
      .set('Cookie', ownerCookie);
    const stateById = new Map(
      refetched.body.state.map((s: { itemId: string; checked: boolean }) => [s.itemId, s.checked]),
    );
    expect(stateById.get(items[0]!.id)).toBe(true);
  });

  it('cross-tenant staffB gets 404 for another shelter application checklist', async () => {
    staffBCookie = await registerStaff(`m6-staffb-${Date.now()}@x.dev`, 'admin', shelterBId);

    const got = await http()
      .get(`/admin/v1/shelters/${shelterBId}/applications/${applicationId}/checklist`)
      .set('Cookie', staffBCookie);
    expect(got.status).toBe(404);

    const put = await http()
      .put(`/admin/v1/shelters/${shelterBId}/applications/${applicationId}/checklist`)
      .set('Cookie', staffBCookie)
      .send({ entries: [] });
    expect(put.status).toBe(404);
  });

  it('stats endpoint computes velocity numbers from direct SQL seeds', async () => {
    await tenants.service(async sql => {
      // One extra available animal, one unavailable.
      await sql`
        insert into animals (shelter_id, name, species, status)
        values (${shelterId}::uuid, 'Stats-Avail', 'cat', 'available'),
               (${shelterId}::uuid, 'Stats-Held', 'cat', 'adopted')`;
      const user = (await sql`
        insert into users (email) values (${'m6-stats-applicant-' + Date.now() + '@x.dev'}) returning id`) as unknown as {
        id: string;
      }[];
      const profile = (await sql`
        insert into applicant_profiles (user_id, legal_name)
        values (${user[0]!.id}::uuid, 'Stats Applicant') returning id`) as unknown as {
        id: string;
      }[];
      const animal = (await sql`
        insert into animals (shelter_id, name, species, status)
        values (${shelterId}::uuid, 'Stats-Adopted-Pet', 'dog', 'adopted') returning id`) as unknown as {
        id: string;
      }[];
      // Two decided within 30d: 10h and 20h placements -> avg 15h. One open.
      const animalB = (await sql`
        insert into animals (shelter_id, name, species, status)
        values (${shelterId}::uuid, 'Stats-Adopted-Pet-2', 'dog', 'adopted') returning id`) as unknown as {
        id: string;
      }[];
      const animalC = (await sql`
        insert into animals (shelter_id, name, species, status)
        values (${shelterId}::uuid, 'Stats-Open-Pet', 'dog', 'available') returning id`) as unknown as {
        id: string;
      }[];
      await sql`
        insert into applications (animal_id, shelter_id, applicant_id, status, submitted_at, decided_at)
        values (${animal[0]!.id}::uuid, ${shelterId}::uuid, ${profile[0]!.id}::uuid,
                'adopted', now() - interval '110 hours', now() - interval '100 hours'),
               (${animalB[0]!.id}::uuid, ${shelterId}::uuid, ${profile[0]!.id}::uuid,
                'approved', now() - interval '230 hours', now() - interval '210 hours'),
               (${animalC[0]!.id}::uuid, ${shelterId}::uuid, ${profile[0]!.id}::uuid,
                'in_review', now() - interval '5 hours', null)`;
    });

    const res = await http()
      .get(`/admin/v1/shelters/${shelterId}/stats`)
      .set('Cookie', ownerCookie);
    expect(res.status).toBe(200);
    const availableRows = (await tenants.service(async sql =>
      sql`select count(*)::int as n from animals where shelter_id = ${shelterId}::uuid and status = 'available'`,
    )) as unknown as { n: number }[];
    const openRows = (await tenants.service(async sql =>
      sql`select count(*)::int as n from applications where shelter_id = ${shelterId}::uuid
          and status in ('submitted','in_review','info_requested')`,
    )) as unknown as { n: number }[];
    expect(res.body.animalsAvailable).toBe(availableRows[0]!.n);
    expect(res.body.openApplications).toBe(openRows[0]!.n);
    const expectedRows = (await tenants.service(async sql =>
      sql`select avg(extract(epoch from (decided_at - submitted_at)) / 3600.0) as h
          from applications
          where shelter_id = ${shelterId}::uuid and decided_at is not null
            and submitted_at is not null and decided_at >= now() - interval '30 days'`,
    )) as unknown as { h: number | null }[];
    const expected = expectedRows[0]!.h;
    expect(expected).not.toBeNull();
    expect(Math.abs((res.body.avgPlacementHours30d as number) - (expected as number)) < 0.01).toBe(true);
  });

  it('writes audit rows for checklist updates', async () => {
    const rows = (await tenants.service(
      sql => sql`select action, count(*)::int as n from audit_logs group by action`,
    )) as unknown as { action: string; n: number }[];
    const byAction = new Map(rows.map(r => [r.action, r.n]));
    expect(byAction.get('checklist.updated') ?? 0).toBeGreaterThan(0);
    expect(byAction.get('application.checklist_updated') ?? 0).toBeGreaterThan(0);
  });
});

describe('m6 contract units', () => {
  it('saveChecklistStateSchema rejects >12 entries', () => {
    const entries = Array.from({ length: 13 }, (_, i) => ({
      itemId: '00000000-0000-4000-8000-000000000000',
      checked: false,
    }));
    expect(saveChecklistStateSchema.safeParse({ entries }).success).toBe(false);
    expect(saveChecklistStateSchema.safeParse({ entries: entries.slice(0, 12) }).success).toBe(true);
  });

  it('saveReviewChecklistSchema rejects empty labels and >12 labels', () => {
    expect(saveReviewChecklistSchema.safeParse({ labels: [''] }).success).toBe(false);
    expect(saveReviewChecklistSchema.safeParse({ labels: ['   '] }).success).toBe(false);
    expect(saveReviewChecklistSchema.safeParse({ labels: ['ok'] }).success).toBe(true);
    expect(
      saveReviewChecklistSchema.safeParse({ labels: Array.from({ length: 13 }, () => 'x') }).success,
    ).toBe(false);
  });
});
