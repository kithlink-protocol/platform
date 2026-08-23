import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { createDb, type DbHandles } from '@kithlink/db';
import {
  saveTaskTemplatesSchema,
  upsertDecisionTemplatesSchema,
} from '@kithlink/contracts';
import { AppModule } from '../src/app.module';
import { ProblemFilter } from '../src/common/http-exception.filter';
import { TenantService } from '../src/modules/db.module';
import { runSeed } from '../scripts/seed';

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

describe.skipIf(!testUrl)('m13 decision + task templates', () => {
  let app: INestApplication;
  let tenants: TenantService;
  let handles: DbHandles;
  let shelterId: string;
  let ownerCookie: string[];
  let staffBCookie: string[];

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
        insert into shelters (name, slug)
        values ('M13 Shelter B', 'm13-shelter-b-' || floor(random() * 1000000)::text)
        on conflict (slug) do update set name = excluded.name
        returning id`) as unknown as { id: string }[];
      return rows2[0]!.id;
    })) as unknown as string;
    staffBCookie = await registerStaff(
      `m13-staff-b-${Date.now()}@x.dev`,
      'admin',
      createdB,
    );
    expect(staffBCookie).toBeTruthy();
  });

  it('PUT decision-templates replaces all and keeps ids for kept labels', async () => {
    const put1 = await http()
      .put(`/admin/v1/shelters/${shelterId}/decision-templates`)
      .set('Cookie', ownerCookie)
      .send({
        templates: [
          { label: 'Approval note', body: 'Your application has been approved.' },
          { label: 'More info', body: 'We need additional documents.' },
        ],
      });
    expect(put1.status).toBe(200);
    expect(put1.body.items).toHaveLength(2);

    const first = put1.body.items as { id: string; label: string; body: string }[];
    const keptBefore = first.find(i => i.label === 'Approval note')!;

    const put2 = await http()
      .put(`/admin/v1/shelters/${shelterId}/decision-templates`)
      .set('Cookie', ownerCookie)
      .send({
        templates: [
          { id: keptBefore.id, label: 'Approval note', body: 'Approved — welcome aboard!' },
          { label: 'Denial note', body: 'We cannot proceed this time.' },
        ],
      });
    expect(put2.status).toBe(200);
    const items = put2.body.items as { id: string; label: string; body: string }[];
    expect(items).toHaveLength(2);
    const keptAfter = items.find(i => i.label === 'Approval note')!;
    expect(keptAfter.id).toBe(keptBefore.id);
    expect(keptAfter.body).toBe('Approved — welcome aboard!');
    expect(items.find(i => i.label === 'More info')).toBeUndefined();
    expect(items.find(i => i.label === 'Denial note')).toBeDefined();
  });

  it('GET decision-templates lists the saved rows', async () => {
    const get = await http()
      .get(`/admin/v1/shelters/${shelterId}/decision-templates`)
      .set('Cookie', ownerCookie);
    expect(get.status).toBe(200);
    expect(get.body.items.map((i: { label: string }) => i.label)).toEqual([
      'Approval note',
      'Denial note',
    ]);
  });

  it('staffB cross-tenant gets 403', async () => {
    const get = await http()
      .get(`/admin/v1/shelters/${shelterId}/decision-templates`)
      .set('Cookie', staffBCookie);
    expect(get.status).toBe(403);
    const put = await http()
      .put(`/admin/v1/shelters/${shelterId}/task-templates`)
      .set('Cookie', staffBCookie)
      .send({ templates: [] });
    expect(put.status).toBe(403);
  });

  it('task-templates GET returns at least 6 platform default rows', async () => {
    const get = await http()
      .get(`/admin/v1/shelters/${shelterId}/task-templates`)
      .set('Cookie', ownerCookie);
    expect(get.status).toBe(200);
    expect(get.body.defaults.length).toBeGreaterThanOrEqual(6);
    expect(new Set(get.body.defaults.map((d: { role: string }) => d.role)).size).toBeGreaterThan(1);
  });

  it('shelter PUT adds a shelter-specific row and never touches platform rows', async () => {
    const before = await http()
      .get(`/admin/v1/shelters/${shelterId}/task-templates`)
      .set('Cookie', ownerCookie);
    const platformBefore = new Set(before.body.defaults.map((d: { id: string }) => d.id));

    const put = await http()
      .put(`/admin/v1/shelters/${shelterId}/task-templates`)
      .set('Cookie', ownerCookie)
      .send({
        templates: [
          {
            role: 'volunteer',
            title: 'M13 shelter-only task',
            description: 'Only visible for this shelter.',
          },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body.shelter).toHaveLength(1);
    expect(put.body.shelter[0].title).toBe('M13 shelter-only task');
    expect(put.body.shelter[0].role).toBe('volunteer');

    const after = await http()
      .get(`/admin/v1/shelters/${shelterId}/task-templates`)
      .set('Cookie', ownerCookie);
    expect(after.body.shelter).toHaveLength(1);
    const platformAfter = after.body.defaults.map((d: { id: string }) => d.id);
    expect(platformAfter.length).toBe(platformBefore.size);
    expect(platformAfter.every((id: string) => platformBefore.has(id))).toBe(true);
  });

  it('writes audit rows for template updates', async () => {
    const rows = (await tenants.service(
      sql => sql`select action, count(*)::int as n from audit_logs group by action`,
    )) as unknown as { action: string; n: number }[];
    const byAction = new Map(rows.map(r => [r.action, r.n]));
    expect(byAction.get('decision_templates.updated') ?? 0).toBeGreaterThan(0);
    expect(byAction.get('task_templates.updated') ?? 0).toBeGreaterThan(0);
  });
});

describe('m13 contract units', () => {
  it('upsertDecisionTemplatesSchema rejects >12 templates and out-of-bounds text', () => {
    const template = { label: 'ok', body: 'ok body' };
    expect(upsertDecisionTemplatesSchema.safeParse({ templates: Array.from({ length: 12 }, () => template) }).success).toBe(true);
    expect(upsertDecisionTemplatesSchema.safeParse({ templates: Array.from({ length: 13 }, () => template) }).success).toBe(false);
    expect(
      upsertDecisionTemplatesSchema.safeParse({
        templates: [{ label: ''.padEnd(121, 'x'), body: 'ok body' }],
      }).success,
    ).toBe(false);
    expect(
      upsertDecisionTemplatesSchema.safeParse({
        templates: [{ label: 'ok', body: ''.padEnd(1001, 'x') }],
      }).success,
    ).toBe(false);
  });

  it('saveTaskTemplatesSchema rejects >16 tasks and invalid roles', () => {
    const task = { role: 'volunteer', title: 'ok', description: 'ok desc' };
    expect(saveTaskTemplatesSchema.safeParse({ templates: Array.from({ length: 16 }, () => task) }).success).toBe(true);
    expect(saveTaskTemplatesSchema.safeParse({ templates: Array.from({ length: 17 }, () => task) }).success).toBe(false);
    expect(saveTaskTemplatesSchema.safeParse({ templates: [{ ...task, role: 'applicant' }] }).success).toBe(false);
    expect(saveTaskTemplatesSchema.safeParse({ templates: [{ ...task, title: '' }] }).success).toBe(false);
  });
});
