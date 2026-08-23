import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { createDb, type DbHandles } from '@kithlink/db';
import {
  animalCreateSchema,
  animalUpdateSchema,
  complianceSummarySchema,
} from '@kithlink/contracts';
import { AppModule } from '../src/app.module';
import { ProblemFilter } from '../src/common/http-exception.filter';
import { runSterilizationSweep } from '../src/modules/animals/animals.service';
import { TenantService } from '../src/modules/db.module';
import { OutboxService } from '../src/modules/notifications/notifications.module';
import { runSeed } from '../scripts/seed';

describe('sterilization schema bounds (unit)', () => {
  it('defaults sterilization status to unknown', () => {
    const parsed = animalCreateSchema.parse({ name: 'Rex', species: 'dog' });
    expect(parsed.sterilization.status).toBe('unknown');
    expect(parsed.sterilization.dueDate).toBeUndefined();
    expect(parsed.sterilization.voucherRef).toBeUndefined();
  });

  it('rejects a status outside the enum', () => {
    expect(() =>
      animalUpdateSchema.parse({ sterilization: { status: 'neutered' } }),
    ).toThrow();
  });

  it('accepts every documented status through the partial update schema', () => {
    for (const status of ['unknown', 'scheduled', 'completed', 'voucher_issued'] as const) {
      const parsed = animalUpdateSchema.parse({ sterilization: { status } });
      expect(parsed.sterilization?.status).toBe(status);
    }
  });

  it('caps voucherRef length at 120 characters', () => {
    expect(() =>
      animalUpdateSchema.parse({ sterilization: { voucherRef: 'v'.repeat(121) } }),
    ).toThrow();
    expect(
      animalUpdateSchema.parse({ sterilization: { voucherRef: 'v'.repeat(120) } })
        .sterilization?.voucherRef,
    ).toHaveLength(120);
  });

  it('validates the compliance summary shape', () => {
    const parsed = complianceSummarySchema.parse({
      total: 10,
      completed: 4,
      scheduled: 3,
      voucherIssued: 2,
      unknown: 1,
      overdue: 5,
    });
    expect(parsed.overdue).toBe(5);
    expect(() => complianceSummarySchema.parse({ total: -1 })).toThrow();
  });
});

const testUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testUrl)('m9 sterilization integration', () => {
  let app: INestApplication;
  let tenants: TenantService;
  let handles: DbHandles;
  let shelterId: string;
  let devCookie: string[];
  let animalId: string;

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

  interface SummaryShape {
    total: number;
    completed: number;
    scheduled: number;
    voucherIssued: number;
    unknown: number;
    overdue: number;
  }

  async function getSummary(): Promise<SummaryShape> {
    const res = await http()
      .get(`/admin/v1/shelters/${shelterId}/sterilization/summary`)
      .set('Cookie', devCookie);
    expect(res.status).toBe(200);
    return res.body as SummaryShape;
  }

  it('creates an animal defaulting to unknown sterilization', async () => {
    const created = await http()
      .post(`/admin/v1/shelters/${shelterId}/animals`)
      .set('Cookie', devCookie)
      .send({ name: `Steri-${run}`, species: 'dog' });
    expect(created.status).toBe(201);
    expect(created.body.sterilization).toEqual({
      status: 'unknown',
      dueDate: null,
      voucherRef: null,
    });
    animalId = created.body.id as string;
  });

  it('PATCH to scheduled with a past due date lands in overdue on the summary', async () => {
    const baseline = await getSummary();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const patched = await http()
      .patch(`/admin/v1/shelters/${shelterId}/animals/${animalId}`)
      .set('Cookie', devCookie)
      .send({ sterilization: { status: 'scheduled', dueDate: past } });
    expect(patched.status).toBe(200);
    expect(patched.body.sterilization.status).toBe('scheduled');
    expect(patched.body.sterilization.dueDate).toBe(past);

    const summary = await getSummary();
    expect(summary.total).toBe(baseline.total);
    expect(summary.scheduled).toBe(baseline.scheduled + 1);
    expect(summary.overdue).toBe(baseline.overdue + 1);
  });

  it('PATCH to completed removes the animal from overdue', async () => {
    const baseline = await getSummary();
    const patched = await http()
      .patch(`/admin/v1/shelters/${shelterId}/animals/${animalId}`)
      .set('Cookie', devCookie)
      .send({ sterilization: { status: 'completed' } });
    expect(patched.status).toBe(200);
    expect(patched.body.sterilization.status).toBe('completed');

    const summary = await getSummary();
    expect(summary.total).toBe(baseline.total);
    expect(summary.completed).toBe(baseline.completed + 1);
    expect(summary.scheduled).toBe(baseline.scheduled - 1);
    expect(summary.overdue).toBe(baseline.overdue - 1);
  });

  it('public detail payload carries the chip-driving fields', async () => {
    const marked = await http()
      .patch(`/admin/v1/shelters/${shelterId}/animals/${animalId}`)
      .set('Cookie', devCookie)
      .send({ medical: { spayNeuter: true }, status: 'available' });
    expect(marked.status).toBe(200);

    const detail = await http().get(`/public/v1/animals/${animalId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.medical.spayNeuter).toBe(true);
    expect(detail.body.sterilization.status).toBe('completed');
  });

  it('reminder sweep sends one email per shelter owner covering all due animals, idempotent within a run', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const dueNames = [`Sweep-${run}-a`, `Sweep-${run}-b`];
    for (const name of dueNames) {
      const created = await http()
        .post(`/admin/v1/shelters/${shelterId}/animals`)
        .set('Cookie', devCookie)
        .send({ name, species: 'dog', status: 'available' });
      expect(created.status).toBe(201);
      const patched = await http()
        .patch(`/admin/v1/shelters/${shelterId}/animals/${created.body.id}`)
        .set('Cookie', devCookie)
        .send({ sterilization: { status: 'scheduled', dueDate: past } });
      expect(patched.status).toBe(200);
    }

    const ownerRows = (await tenants.service(async sql => {
      return sql`
        select u.email
        from staff_members sm
        join users u on u.id = sm.user_id and u.deleted_at is null
        where sm.shelter_id = ${shelterId}::uuid and sm.role in ('owner', 'admin')`;
    })) as unknown as { email: string }[];
    expect(ownerRows.length).toBeGreaterThanOrEqual(1);

    const beforeRows = (await tenants.service(
      sql => sql`select count(*)::int as n from outbox_events where topic = 'sterilization.reminder'`,
    )) as unknown as { n: number }[];

    await runSterilizationSweep(tenants, app.get(OutboxService));

    const afterRows = (await tenants.service(async sql => {
      return sql`
        select payload_json
        from outbox_events
        where topic = 'sterilization.reminder'
        order by created_at desc`;
    })) as unknown as { payload_json: { to: string[]; subject: string; text: string } }[];

    const sent = afterRows.length - beforeRows[0]!.n;
    expect(sent).toBe(ownerRows.length);

    const fresh = afterRows.slice(0, sent);
    for (const owner of ownerRows) {
      const row = fresh.find(r => r.payload_json.to.includes(owner.email));
      expect(row).toBeTruthy();
      expect(row!.payload_json.text).toContain(dueNames[0]!);
      expect(row!.payload_json.text).toContain(dueNames[1]!);
    }
  });
});
