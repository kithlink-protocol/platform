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
const suite = testUrl ? describe : describe.skip;

describe.skipIf(!testUrl)('api integration', () => {
  let app: INestApplication;
  let tenants: TenantService;
  let handles: DbHandles;
  let shelterId: string;
  let devCookie: string[];
  let volunteerAnimalId: string;

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

  it('registers and exposes the session as /me', async () => {
    const email = `reg-${Date.now()}@x.dev`;
    const reg = await http().post('/app/v1/auth/register').send({ email, password: 'Password123x' });
    expect(reg.status).toBe(201);
    expect(reg.body.emailVerified).toBe(false);
    const me = await http().get('/app/v1/auth/session').set('Cookie', reg.headers['set-cookie']);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user.emailVerified).toBe(false);
  });

  it('rejects a wrong password with a 401 problem+json', async () => {
    const res = await http()
      .post('/app/v1/auth/login')
      .send({ email: 'nobody@x.dev', password: 'WrongPass123' });
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('seeds the happytail shelter', async () => {
    await runSeed(handles);
    const rows = (await tenants.service(
      sql => sql`select id from shelters where slug = 'happytail'`,
    )) as unknown as { id: string }[];
    expect(rows[0]?.id).toBeTruthy();
    shelterId = rows[0]!.id;
  });

  it('logs in the seeded owner', async () => {
    devCookie = await loginAndGetCookie('dev@kithlink.dev', 'DevOnly123!x');
    const me = await http().get('/app/v1/auth/session').set('Cookie', devCookie);
    expect(me.status).toBe(200);
    expect(me.body.memberships.some(m => m.shelterId === shelterId && m.role === 'owner')).toBe(true);
  });

  it('adds a volunteer who can create and edit animals', async () => {
    const volEmail = `vol-${Date.now()}@x.dev`;
    await http().post('/app/v1/auth/register').send({ email: volEmail, password: 'Password123x' });
    const added = await http()
      .post(`/admin/v1/shelters/${shelterId}/staff-members`)
      .set('Cookie', devCookie)
      .send({ email: volEmail, role: 'volunteer' });
    expect(added.status).toBe(201);
    expect(added.body.userId).toBeTruthy();

    const volCookie = await loginAndGetCookie(volEmail, 'Password123x');
    const created = await http()
      .post(`/admin/v1/shelters/${shelterId}/animals`)
      .set('Cookie', volCookie)
      .send({ name: 'Ziggy', species: 'dog' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('available');
    volunteerAnimalId = created.body.id;

    const patched = await http()
      .patch(`/admin/v1/shelters/${shelterId}/animals/${volunteerAnimalId}`)
      .set('Cookie', volCookie)
      .send({ status: 'pending' });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('pending');
  });

  it('public registry only lists available animals', async () => {
    const list = await http().get('/public/v1/shelters/happytail/animals');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.items)).toBe(true);
    for (const item of list.body.items) expect(item.status).toBe('available');
    const names: string[] = list.body.items.map((i: { name: string }) => i.name);
    expect(names).not.toContain('Luna');
    expect(names).toContain('Rex');

    const detail = await http().get('/public/v1/shelters/happytail');
    expect(detail.status).toBe(200);
    expect(detail.body.availableAnimalCount).toBe(list.body.items.length);
    expect(detail.body.availableAnimalCount).toBeGreaterThan(0);
  });

  it('blocks cross-tenant animal edits with 403', async () => {
    const bEmail = `cross-b-${Date.now()}@x.dev`;
    const otherSlug = `other-rescue-${Date.now()}`;
    await http().post('/app/v1/auth/register').send({ email: bEmail, password: 'Password123x' });
    await tenants.service(async sql => {
      const rows = (await sql`
        insert into shelters (slug, name) values (${otherSlug}, 'Other Rescue')
        returning id`) as unknown as { id: string }[];
      await sql`
        insert into staff_members (shelter_id, user_id, role)
        select ${rows[0]!.id}, u.id, 'owner'
        from users u
        where u.email = ${bEmail}`;
    });
    const bCookie = await loginAndGetCookie(bEmail, 'Password123x');
    const attempt = await http()
      .patch(`/admin/v1/shelters/${shelterId}/animals/${volunteerAnimalId}`)
      .set('Cookie', bCookie)
      .send({ status: 'adopted' });
    expect(attempt.status).toBe(403);
  });

  it('records audit rows for sensitive actions', async () => {
    const rows = (await tenants.service(
      sql => sql`select action, count(*)::int as n from audit_logs group by action`,
    )) as unknown as { action: string; n: number }[];
    const byAction = new Map(rows.map(r => [r.action, r.n]));
    for (const action of ['user.registered', 'auth.login', 'animal.created', 'animal.updated', 'staff.added']) {
      expect(byAction.get(action) ?? 0).toBeGreaterThan(0);
    }
  });
});
