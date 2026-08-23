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

  describe('M1 applicant loop', () => {
    let applicantCookie: string[];
    let applicantEmail: string;
    let applicantProfileId: string;
    let artifactId: string;
    let grantId: string;
    let applicationId: string;
    let animalAId: string;
    let animalBId: string;

    it('upserts the profile and never returns the address', async () => {
      applicantEmail = `applicant-${Date.now()}@x.dev`;
      await http().post('/app/v1/auth/register').send({ email: applicantEmail, password: 'Password123x' });
      applicantCookie = (await http().post('/app/v1/auth/login').send({ email: applicantEmail, password: 'Password123x' })).headers['set-cookie'];

      const put = await http().put('/app/v1/me/profile').set('Cookie', applicantCookie).send({
        legalName: 'Ada Lovelace',
        displayName: 'Ada',
        phone: '+14155551234',
        address: '12 Secret St, Springfield',
      });
      expect([200, 201]).toContain(put.status);
      expect(put.body.legalName).toBe('Ada Lovelace');
      expect(put.body.address).toBeUndefined();
      applicantProfileId = put.body.id;

      const get = await http().get('/app/v1/me/profile').set('Cookie', applicantCookie);
      expect(get.status).toBe(200);
      expect(JSON.stringify(get.body)).not.toContain('Secret St');
      expect(get.body.address).toBeUndefined();
      expect(get.body.phone).toBe('+14155551234');
    });

    it('returns a 400 when applying without a profile', async () => {
      const noProfileEmail = `noprofile-${Date.now()}@x.dev`;
      await http().post('/app/v1/auth/register').send({ email: noProfileEmail, password: 'Password123x' });
      const noProfileCookie = (await http().post('/app/v1/auth/login').send({ email: noProfileEmail, password: 'Password123x' })).headers['set-cookie'];
      const res = await http().post('/app/v1/applications').set('Cookie', noProfileCookie)
        .send({ animalId: volunteerAnimalId });
      expect(res.status).toBe(400);
    });

    it('initializes an artifact upload with a presigned PUT', async () => {
      const res = await http().post('/app/v1/me/artifacts').set('Cookie', applicantCookie)
        .send({ type: 'gov_id', mime: 'image/png', bytes: 1024 });
      expect(res.status).toBe(201);
      expect(res.body.artifact.state).toBe('uploaded');
      expect(res.body.upload.url).toMatch(/^https?:\/\//);
      expect(res.body.upload.fields).toBeNull();
      expect(res.body.upload.expiresIn).toBe(600);
      artifactId = res.body.artifact.id;
    });

    it('submits an application, grants consent, and gates staff visibility via RLS', async () => {
      const seeded = (await tenants.service(async sql => {
        const a = (await sql`
          insert into animals (shelter_id, name, species, status)
          values (${shelterId}::uuid, 'Biscuit', 'dog', 'available') returning id`) as unknown as { id: string }[];
        const b = (await sql`
          insert into animals (shelter_id, name, species, status)
          values (${shelterId}::uuid, 'Miso', 'cat', 'available') returning id`) as unknown as { id: string }[];
        return { a: a[0]!.id, b: b[0]!.id };
      })) as { a: string; b: string };
      animalAId = seeded.a;
      animalBId = seeded.b;

      const apply = await http().post('/app/v1/applications').set('Cookie', applicantCookie)
        .send({ animalId: animalAId, answers: { why_this_pet: ' companionship' } });
      expect(apply.status).toBe(201);
      expect(apply.body.application.status).toBe('submitted');
      expect(apply.body.application.animalName).toBe('Biscuit');
      expect(apply.body.consentGrantId).toBeTruthy();
      applicationId = apply.body.application.id;
      grantId = apply.body.consentGrantId;

      const consents = await http().get('/app/v1/me/consents').set('Cookie', applicantCookie);
      expect(consents.status).toBe(200);
      const grant = consents.body.find((g: { id: string }) => g.id === grantId);
      expect(grant?.scope).toBe('application_review');
      expect(grant?.status).toBe('active');
      expect(grant?.shelterName.length).toBeGreaterThan(0);

      const staffApps = await http().get(`/admin/v1/shelters/${shelterId}/applications`).set('Cookie', devCookie);
      expect(staffApps.status).toBe(200);
      expect(staffApps.body.items.some((a: { id: string }) => a.id === applicationId)).toBe(true);

      const staffArtifacts = await http()
        .get(`/admin/v1/shelters/${shelterId}/artifacts?applicantId=${applicantProfileId}`)
        .set('Cookie', devCookie);
      expect(staffArtifacts.status).toBe(200);
      expect(staffArtifacts.body.items.some((a: { id: string }) => a.id === artifactId)).toBe(true);

      const revoke = await http().delete(`/app/v1/me/consents/${grantId}`).set('Cookie', applicantCookie);
      expect(revoke.status).toBe(200);

      const afterRevoke = await http()
        .get(`/admin/v1/shelters/${shelterId}/artifacts?applicantId=${applicantProfileId}`)
        .set('Cookie', devCookie);
      expect(afterRevoke.status).toBe(200);
      expect(afterRevoke.body.items).toEqual([]);

      const fileAttempt = await http()
        .get(`/admin/v1/shelters/${shelterId}/artifacts/${artifactId}/file`)
        .set('Cookie', devCookie);
      expect(fileAttempt.status).toBe(403);

      const dupApply = await http().post('/app/v1/applications').set('Cookie', applicantCookie)
        .send({ animalId: animalAId });
      expect(dupApply.status).toBe(409);
    });

    it('validates transitions and extends consent on terminal decisions', async () => {
      const second = await http().post('/app/v1/applications').set('Cookie', applicantCookie)
        .send({ animalId: animalBId });
      expect(second.status).toBe(201);
      const secondAppId = second.body.application.id;

      const invalid = await http()
        .patch(`/admin/v1/shelters/${shelterId}/applications/${secondAppId}/status`)
        .set('Cookie', devCookie)
        .send({ status: 'approved' });
      expect(invalid.status).toBe(400);

      const toReview = await http()
        .patch(`/admin/v1/shelters/${shelterId}/applications/${secondAppId}/status`)
        .set('Cookie', devCookie)
        .send({ status: 'in_review' });
      expect(toReview.status).toBe(200);

      const approve = await http()
        .patch(`/admin/v1/shelters/${shelterId}/applications/${secondAppId}/status`)
        .set('Cookie', devCookie)
        .send({ status: 'approved', note: 'great fit' });
      expect(approve.status).toBe(200);
      expect(approve.body.status).toBe('approved');

      const decided = (await tenants.service(async sql => {
        return sql`select decided_at from applications where id = ${secondAppId}::uuid`;
      })) as unknown as { decided_at: string | null }[];
      expect(decided[0]?.decided_at).toBeTruthy();

      const grants = (await tenants.service(async sql => {
        return sql`select expires_at from consent_grants where application_id = ${secondAppId}::uuid`;
      })) as unknown as { expires_at: string | null }[];
      const expiresAt = new Date(grants[0]!.expires_at!).getTime();
      const days90 = 90 * 24 * 60 * 60 * 1000;
      expect(Math.abs(expiresAt - (Date.now() + days90))).toBeLessThan(24 * 60 * 60 * 1000);
    });
  });

  describe('M2 verification network', () => {
    it('confirms, shares across shelters, accepts prior, and revokes', async () => {
      const email = `m2-${Date.now()}@x.dev`;
      await http().post('/app/v1/auth/register').send({ email, password: 'Password123x' });
      const applicantCookie = (
        await http().post('/app/v1/auth/login').send({ email, password: 'Password123x' })
      ).headers['set-cookie'];
      const put = await http().put('/app/v1/me/profile').set('Cookie', applicantCookie).send({
        legalName: 'M2 Applicant',
        displayName: 'Em',
        phone: '+14155550000',
      });
      expect(put.status).toBe(200);
      const profileId = put.body.id as string;

      const artifactId = (await tenants.service(async sql => {
        const rows = (await sql`
          insert into artifacts (applicant_id, type, state, extracted_json)
          values (${profileId}::uuid, 'lease_addendum', 'parsed', '{"landlord_phone":"+15551234567"}'::jsonb)
          returning id`) as unknown as { id: string }[];
        return rows[0]!.id;
      })) as string;

      const animalA = await tenants.service(async sql => {
        const rows = (await sql`
          insert into animals (shelter_id, name, species, status)
          values (${shelterId}::uuid, 'M2A', 'dog', 'available') returning id`) as unknown as {
          id: string;
        }[];
        return rows[0]!.id;
      });
      const applyA = await http().post('/app/v1/applications').set('Cookie', applicantCookie)
        .send({ animalId: animalA, answers: { why: 'network test' } });
      expect(applyA.status).toBe(201);

      const confirm = await http()
        .post(`/admin/v1/shelters/${shelterId}/artifacts/${artifactId}/verifications`)
        .set('Cookie', devCookie)
        .send({ method: 'landlord_call', outcome: 'confirmed', notesRedacted: 'Landlord confirmed pet policy' });
      expect(confirm.status).toBe(201);
      expect(confirm.body.state).toBe('verified');
      expect(confirm.body.verifications[0].method).toBe('landlord_call');
      expect(confirm.body.verifications[0].outcome).toBe('confirmed');
      expect(confirm.body.verifications[0].shelterName.length).toBeGreaterThan(0);
      expect(confirm.body.networkVerified).toBe(false);

      const bEmail = `m2-staff-b-${Date.now()}@x.dev`;
      await http().post('/app/v1/auth/register').send({ email: bEmail, password: 'Password123x' });
      const shelterB = (await tenants.service(async sql => {
        const s = (await sql`
          insert into shelters (slug, name) values (${'m2-shelter-b-' + Date.now()}, 'Second Shelter')
          returning id`) as unknown as { id: string }[];
        await sql`
          insert into staff_members (shelter_id, user_id, role)
          select ${s[0]!.id}, u.id, 'owner' from users u where u.email = ${bEmail}`;
        return s[0]!.id;
      })) as string;

      const animalB = await tenants.service(async sql => {
        const rows = (await sql`
          insert into animals (shelter_id, name, species, status)
          values (${shelterB}::uuid, 'M2B', 'cat', 'available') returning id`) as unknown as {
          id: string;
        }[];
        return rows[0]!.id;
      });
      const applyB = await http().post('/app/v1/applications').set('Cookie', applicantCookie)
        .send({ animalId: animalB });
      expect(applyB.status).toBe(201);
      const applicationBId = applyB.body.application.id as string;

      const bLogin = await http().post('/app/v1/auth/login').send({ email: bEmail, password: 'Password123x' });
      const bCookie = bLogin.headers['set-cookie'];

      const detail = await http()
        .get(`/admin/v1/shelters/${shelterB}/applications/${applicationBId}`)
        .set('Cookie', bCookie);
      expect(detail.status).toBe(200);
      expect(detail.body.applicant.legalName).toBe('M2 Applicant');
      expect(detail.body.consent.status).toBe('active');
      const shared = detail.body.artifacts.find((a: { id: string }) => a.id === artifactId);
      expect(shared).toBeTruthy();
      expect(shared.networkVerified).toBe(true);
      expect(shared.verifications.some((v: { shelterName: string }) => v.shelterName === 'Happytail Rescue')).toBe(true);

      const acceptPrior = await http()
        .post(`/admin/v1/shelters/${shelterB}/artifacts/${artifactId}/verifications`)
        .set('Cookie', bCookie)
        .send({ method: 'prior_verification', outcome: 'confirmed' });
      expect(acceptPrior.status).toBe(201);
      expect(acceptPrior.body.verifications.length).toBe(2);
      expect(acceptPrior.body.networkVerified).toBe(true);

      const revoke = await http()
        .post(`/app/v1/me/artifacts/${artifactId}/revoke-verifications`)
        .set('Cookie', applicantCookie);
      expect(revoke.status).toBe(201);
      expect(revoke.body.revoked).toBe(2);
      expect(revoke.body.networkVerified).toBe(false);

      const rows = (await tenants.service(async sql => {
        return sql`select outcome from verifications where artifact_id = ${artifactId}::uuid order by verified_at`;
      })) as unknown as { outcome: string }[];
      expect(rows.map(r => r.outcome)).toEqual(['revoked', 'revoked']);
    });
  });
});
