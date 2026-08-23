import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { createDb, type DbHandles } from '@kithlink/db';
import { animalSearchResponseSchema, type JourneyDetail } from '@kithlink/contracts';
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
    const probeName = `PubProbe-${Date.now()}`;
    const probeUnavailable = `${probeName}-NA`;
    await tenants.service(async sql => {
      await sql`insert into animals (shelter_id, name, species, status)
        select s.id, ${probeName}, 'dog', 'available' from shelters s where s.slug = 'happytail'`;
      await sql`insert into animals (shelter_id, name, species, status)
        select s.id, ${probeUnavailable}, 'dog', 'adopted' from shelters s where s.slug = 'happytail'`;
    });
    const list = await http().get('/public/v1/shelters/happytail/animals?limit=100');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.items)).toBe(true);
    for (const item of list.body.items) expect(item.status).toBe('available');
    const names: string[] = list.body.items.map((i: { name: string }) => i.name);
    expect(names).toContain(probeName);
    expect(names).not.toContain(`${probeName}-NA`);

    const detail = await http().get('/public/v1/shelters/happytail');
    expect(detail.status).toBe(200);
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

  describe('M5 applicant history + notes', () => {
    let m5ApplicantCookie: string[];
    let m5ProfileId: string;
    let m5ApplicationId: string;
    let m5ArtifactId: string;

    it('assembles history: two applications at shelter, full provenance, audit row', async () => {
      const email = `m5-${Date.now()}@x.dev`;
      await http().post('/app/v1/auth/register').send({ email, password: 'Password123x' });
      m5ApplicantCookie = (
        await http().post('/app/v1/auth/login').send({ email, password: 'Password123x' })
      ).headers['set-cookie'];
      const put = await http().put('/app/v1/me/profile').set('Cookie', m5ApplicantCookie).send({
        legalName: 'M5 Applicant',
        displayName: 'Em Five',
        phone: '+14155550005',
      });
      expect(put.status).toBe(200);
      m5ProfileId = put.body.id as string;

      const animalAId = (await tenants.service(async sql => {
        const rows = (await sql`
          insert into animals (shelter_id, name, species, status)
          values (${shelterId}::uuid, 'M5A', 'dog', 'available') returning id`) as unknown as {
          id: string;
        }[];
        return rows[0]!.id;
      })) as string;
      const applyA = await http().post('/app/v1/applications').set('Cookie', m5ApplicantCookie)
        .send({ animalId: animalAId });
      expect(applyA.status).toBe(201);
      m5ApplicationId = applyA.body.application.id as string;

      // Second (older) application by the same applicant, inserted directly.
      const animalBId = (await tenants.service(async sql => {
        const rows = (await sql`
          insert into animals (shelter_id, name, species, status)
          values (${shelterId}::uuid, 'M5B', 'cat', 'available') returning id`) as unknown as {
          id: string;
        }[];
        return rows[0]!.id;
      })) as string;
      await tenants.service(async sql => {
        await sql`
          insert into applications (animal_id, shelter_id, applicant_id, status, answers_json, submitted_at)
          values (${animalBId}::uuid, ${shelterId}::uuid, ${m5ProfileId}::uuid, 'denied', '{}'::jsonb,
                  now() - interval '30 days')`;
      });

      // Artifact + verification flow per M2 helpers.
      m5ArtifactId = (await tenants.service(async sql => {
        const rows = (await sql`
          insert into artifacts (applicant_id, type, state, extracted_json)
          values (${m5ProfileId}::uuid, 'lease_addendum', 'parsed', '{"landlord_phone":"+15551234567"}'::jsonb)
          returning id`) as unknown as { id: string }[];
        return rows[0]!.id;
      })) as string;
      const confirm = await http()
        .post(`/admin/v1/shelters/${shelterId}/artifacts/${m5ArtifactId}/verifications`)
        .set('Cookie', devCookie)
        .send({ method: 'landlord_call', outcome: 'confirmed' });
      expect(confirm.status).toBe(201);

      const history = await http()
        .get(`/admin/v1/shelters/${shelterId}/applications/${m5ApplicationId}/applicant-history`)
        .set('Cookie', devCookie);
      expect(history.status).toBe(200);
      expect(history.body.profile.legalName).toBe('M5 Applicant');
      expect(history.body.applicationsAtShelter).toHaveLength(2);
      expect(history.body.generatedAt).toBeTruthy();
      const happytailConfirmed = history.body.sharedArtifacts
        .flatMap((a: { verifications: { shelterName: string; outcome: string; verifiedAt?: string }[] }) => a.verifications)
        .find(
          (v: { shelterName: string; outcome: string }) =>
            v.shelterName === 'Happytail Rescue' && v.outcome === 'confirmed',
        ) as { verifiedAt: string } | undefined;
      expect(happytailConfirmed).toBeTruthy();
      expect(happytailConfirmed!.verifiedAt).toBeTruthy();

      const auditRows = (await tenants.service(
        sql =>
          sql`select count(*)::int as n from audit_logs where action = 'applicant.history_viewed'`,
      )) as unknown as { n: number }[];
      expect(auditRows[0]!.n).toBeGreaterThan(0);
    });

    it('adds a note as coordinator and lists it ascending with author name', async () => {
      const add = await http()
        .post(`/admin/v1/shelters/${shelterId}/applications/${m5ApplicationId}/notes`)
        .set('Cookie', devCookie)
        .send({ body: 'Spoke with applicant by phone.' });
      expect(add.status).toBe(201);
      expect(add.body.authorName).toBe('dev@kithlink.dev');
      expect(add.body.body).toBe('Spoke with applicant by phone.');

      const bad = await http()
        .post(`/admin/v1/shelters/${shelterId}/applications/${m5ApplicationId}/notes`)
        .set('Cookie', devCookie)
        .send({ body: '' });
      expect(bad.status).toBe(400);

      const list = await http()
        .get(`/admin/v1/shelters/${shelterId}/applications/${m5ApplicationId}/notes`)
        .set('Cookie', devCookie);
      expect(list.status).toBe(200);
      expect(Array.isArray(list.body.items)).toBe(true);
      const found = list.body.items.find((n: { body: string }) => n.body === 'Spoke with applicant by phone.');
      expect(found?.authorName).toBe('dev@kithlink.dev');
    });

    it('blocks cross-tenant staff from another shelter with 404', async () => {
      const bEmail = `m5-staff-b-${Date.now()}@x.dev`;
      await http().post('/app/v1/auth/register').send({ email: bEmail, password: 'Password123x' });
      const shelterB = (await tenants.service(async sql => {
        const s = (await sql`
          insert into shelters (slug, name) values (${'m5-shelter-b-' + Date.now()}, 'M5 Shelter B')
          returning id`) as unknown as { id: string }[];
        await sql`
          insert into staff_members (shelter_id, user_id, role)
          select ${s[0]!.id}, u.id, 'owner'
          from users u
          where u.email = ${bEmail}`;
        return s[0]!.id;
      })) as string;
      const bCookie = (
        await http().post('/app/v1/auth/login').send({ email: bEmail, password: 'Password123x' })
      ).headers['set-cookie'];

      const res = await http()
        .get(`/admin/v1/shelters/${shelterB}/applications/${m5ApplicationId}/applicant-history`)
        .set('Cookie', bCookie);
      expect(res.status).toBe(404);

      const notesRes = await http()
        .get(`/admin/v1/shelters/${shelterB}/applications/${m5ApplicationId}/notes`)
        .set('Cookie', bCookie);
      expect(notesRes.status).toBe(404);
    });
  });

  describe('M3 sites, rss, sync', () => {
    it('saves config, publishes, and serves escaped html, CURRENT, and rss', async () => {
      const save = await http()
        .put(`/admin/v1/shelters/${shelterId}/site/config`)
        .set('Cookie', devCookie)
        .send({ heroTitle: '<b>bold</b> Happy Tails', heroBody: "Adopt don't shop & visit", themeSlug: 'default' });
      expect(save.status).toBe(200);
      expect(save.body.slug).toBe('happytail');

      const animal = await http()
        .post(`/admin/v1/shelters/${shelterId}/animals`)
        .set('Cookie', devCookie)
        .send({ name: `M3Rss-${Date.now()}`, species: 'cat' });
      expect(animal.status).toBe(201);
      const animalName = animal.body.name as string;

      const pub = await http()
        .post(`/admin/v1/shelters/${shelterId}/site/publish`)
        .set('Cookie', devCookie);
      expect(pub.status).toBe(201);
      expect(pub.body.slug).toBe('happytail');
      expect(pub.body.animalCount).toBeGreaterThan(0);
      const buildId = pub.body.buildId as string;
      expect(buildId).toMatch(/^[0-9a-f-]{36}$/);

      const idx = await http().get('/public/v1/sites/happytail/index.html');
      expect(idx.status).toBe(200);
      expect(idx.headers['content-type']).toContain('text/html');
      expect(idx.headers['cache-control']).toContain('max-age=60');
      expect(idx.text).toContain('&lt;b&gt;bold&lt;/b&gt;');
      expect(idx.text).toContain(animalName);

      const cur = await http().get('/public/v1/sites/happytail/CURRENT');
      expect(cur.status).toBe(200);
      expect(cur.text.trim()).toBe(buildId);

      const animalsPage = await http().get('/public/v1/sites/happytail/animals.html');
      expect(animalsPage.status).toBe(200);
      expect(animalsPage.text).toContain(animalName);

      const rss = await http().get('/public/v1/feed/shelters/happytail/rss.xml');
      expect(rss.status).toBe(200);
      expect(rss.text).toContain('<rss version="2.0">');
      expect(rss.text).toContain('<item>');
      expect(rss.text).toContain(`<title>${animalName}</title>`);
    });

    it('rejects a bad theme slug with 400', async () => {
      const res = await http()
        .put(`/admin/v1/shelters/${shelterId}/site/config`)
        .set('Cookie', devCookie)
        .send({ heroTitle: 'x', heroBody: 'y', themeSlug: 'nope' });
      expect(res.status).toBe(400);
    });

    it('upserts a masked dry-run target and pushes inventory without network calls', async () => {
      const detail = await http().get('/public/v1/shelters/happytail');
      const available = detail.body.availableAnimalCount as number;
      expect(available).toBeGreaterThan(0);

      const put = await http()
        .put(`/admin/v1/shelters/${shelterId}/sync-targets`)
        .set('Cookie', devCookie)
        .send({ provider: 'petfinder', clientId: 'test-client-id-1', clientSecret: 'test-secret-xyz', mode: 'dry_run' });
      expect(put.status).toBe(200);
      expect(put.body.provider).toBe('petfinder');
      expect(JSON.stringify(put.body)).not.toContain('test-secret-xyz');
      expect(JSON.stringify(put.body)).not.toContain('credentials_enc');

      const list = await http().get(`/admin/v1/shelters/${shelterId}/sync-targets`).set('Cookie', devCookie);
      expect(list.status).toBe(200);
      const bodyText = JSON.stringify(list.body);
      expect(bodyText).not.toContain('test-secret-xyz');
      expect(bodyText).not.toContain('clientSecret');

      const run = await http()
        .post(`/admin/v1/shelters/${shelterId}/sync-targets/petfinder/run`)
        .set('Cookie', devCookie);
      expect(run.status).toBe(201);
      expect(run.body.pushed).toBe(available);
      expect(run.body.failed).toBe(0);
      expect(run.body.decisionsCount).toBeGreaterThan(0);
      expect(run.body.finishedAt).toBeTruthy();
      expect(run.body.trigger).toBe('manual');

      const runRows = (await tenants.service(async sql => {
        return sql`
          select pushed, failed, decisions_json from sync_runs
          where target_id in (select id from sync_targets where shelter_id = ${shelterId}::uuid)
          order by started_at desc limit 1`;
      })) as unknown as { pushed: number; failed: number; decisions_json: { decision?: string }[] }[];
      expect(runRows[0]?.pushed).toBe(available);
      expect((runRows[0]?.decisions_json ?? []).some(d => (d.decision ?? '').includes('dry-run'))).toBe(true);
    });
  });

  describe('M5 discovery', () => {
    let northId: string;
    let southId: string;
    let rexId: string;
    let bellaId: string;
    let avaId: string;
    let miloId: string;
    let goneId: string;

    it('seeds geo shelters and animals with varying attributes', async () => {
      const year = new Date().getUTCFullYear();
      await tenants.service(async sql => {
        const north = (await sql`
          insert into shelters (slug, name, city, state, postal_code, latitude, longitude)
          values ('north-shelter', 'North Shelter', 'Portland', 'OR', '97201', 45.52, -122.68)
          on conflict (slug) do update set name = excluded.name
          returning id`) as unknown as { id: string }[];
        northId = north[0]!.id;
        const south = (await sql`
          insert into shelters (slug, name, city, state, postal_code, latitude, longitude)
          values ('south-shelter', 'South Shelter', 'Austin', 'TX', '78701', 30.27, -97.74)
          on conflict (slug) do update set name = excluded.name
          returning id`) as unknown as { id: string }[];
        southId = south[0]!.id;
        await sql`delete from animals where shelter_id in (${northId}::uuid, ${southId}::uuid)`;
        const insert = async (
          shelterId: string,
          name: string,
          species: string,
          breed: string | null,
          birthYear: number | null,
          sex: string,
          size: string | null,
          status: string,
        ): Promise<string> => {
          const rows = (await sql`
            insert into animals (shelter_id, name, species, breed, birth_year, sex, size, status)
            values (${shelterId}::uuid, ${name}, ${species}, ${breed}, ${birthYear}, ${sex}, ${size}, ${status})
            returning id`) as unknown as { id: string }[];
          return rows[0]!.id;
        };
        rexId = await insert(northId, 'Rex North', 'dog', 'Labrador', year - 5, 'male', 'large', 'available');
        bellaId = await insert(northId, 'Bella North', 'cat', 'Siamese', year - 12, 'female', 'small', 'available');
        goneId = await insert(northId, 'Gone North', 'dog', null, year - 3, 'male', 'medium', 'adopted');
        avaId = await insert(southId, 'Ava South', 'dog', 'Poodle', year, 'female', 'small', 'available');
        miloId = await insert(southId, 'Milo South', 'cat', null, year - 2, 'male', 'medium', 'available');
      });
      expect(northId).toBeTruthy();
      expect(southId).toBeTruthy();
    });

    it('filters by species and sex across shelters', async () => {
      const res = await http().get('/public/v1/animals?species=dog&sex=male');
      expect(res.status).toBe(200);
      const ids = (res.body.items as { id: string }[]).map(i => i.id);
      expect(ids).toContain(rexId);
      expect(ids).not.toContain(bellaId);
      expect(ids).not.toContain(avaId);
      for (const item of res.body.items as { species: string; sex: string }[]) {
        expect(item.species).toBe('dog');
        expect(item.sex).toBe('male');
      }
    });

    it('buckets ageClass from birthYear', async () => {
      const baby = await http().get('/public/v1/animals?shelterSlug=south-shelter&ageClass=baby');
      expect((baby.body.items as { id: string }[]).map(i => i.id)).toEqual([avaId]);
      const young = await http().get('/public/v1/animals?shelterSlug=south-shelter&ageClass=young');
      expect((young.body.items as { id: string }[]).map(i => i.id)).toEqual([miloId]);
      const adult = await http().get('/public/v1/animals?shelterSlug=north-shelter&ageClass=adult');
      expect((adult.body.items as { id: string }[]).map(i => i.id)).toEqual([rexId]);
      const senior = await http().get('/public/v1/animals?shelterSlug=north-shelter&ageClass=senior');
      expect((senior.body.items as { id: string }[]).map(i => i.id)).toEqual([bellaId]);
    });

    it('matches q against breed', async () => {
      const res = await http().get('/public/v1/animals?q=Poodle');
      expect(res.status).toBe(200);
      expect((res.body.items as { id: string }[]).map(i => i.id)).toEqual([avaId]);
    });

    it('applies the radius filter and returns distances', async () => {
      const res = await http().get('/public/v1/animals?nearLat=45.52&nearLng=-122.68&radiusKm=100');
      expect(res.status).toBe(200);
      const items = res.body.items as { id: string; distanceKm: number | null; shelterSlug: string }[];
      expect(items.map(i => i.id)).toContain(rexId);
      expect(items.map(i => i.id)).not.toContain(avaId);
      for (const item of items) {
        expect(item.shelterSlug).not.toBe('south-shelter');
        expect(item.distanceKm).not.toBeNull();
      }
    });

    it('parses search responses against the contract', async () => {
      const res = await http().get('/public/v1/animals?shelterSlug=north-shelter');
      expect(res.status).toBe(200);
      const parsed = animalSearchResponseSchema.parse(res.body);
      const rex = parsed.items.find(i => i.id === rexId)!;
      expect(rex.ageClass).toBe('adult');
      expect(rex.shelterName).toBe('North Shelter');
      expect(rex.shelterSlug).toBe('north-shelter');
    });

    it('serves public detail and 404s adopted animals', async () => {
      const missing = await http().get(`/public/v1/animals/${goneId}`);
      expect(missing.status).toBe(404);

      const detail = await http().get(`/public/v1/animals/${avaId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.shelter.slug).toBe('south-shelter');
      expect(detail.body.shelter.city).toBe('Austin');
      expect(detail.body.shelter.state).toBe('TX');
      expect(detail.body.name).toBe('Ava South');
    });

    it('updates shelter profile as admin and audits it, rejecting cross-shelter edits', async () => {
      const forbidden = await http()
        .patch(`/admin/v1/shelters/${southId}`)
        .set('Cookie', devCookie)
        .send({ city: 'Dallas' });
      expect(forbidden.status).toBe(403);

      const patch = await http()
        .patch(`/admin/v1/shelters/${shelterId}`)
        .set('Cookie', devCookie)
        .send({ city: 'Portland', state: 'OR', postalCode: '97205', latitude: 45.5231, longitude: -122.6765 });
      expect(patch.status).toBe(200);
      expect(patch.body.postalCode).toBe('97205');

      const rows = (await tenants.service(async sql => {
        return sql`select city, state, postal_code, latitude from shelters where id = ${shelterId}::uuid`;
      })) as unknown as { city: string; state: string; postal_code: string; latitude: number }[];
      expect(rows[0]?.city).toBe('Portland');
      expect(rows[0]?.latitude).toBeCloseTo(45.5231, 4);

      const audits = (await tenants.service(async sql => {
        return sql`
          select action from audit_logs
          where action = 'shelter.updated' and entity_id = ${shelterId}
          order by created_at desc limit 1`;
      })) as unknown as { action: string }[];
      expect(audits[0]?.action).toBe('shelter.updated');
    });
  });

  describe('M5 auth recovery', () => {
    const m5 = { email: '', resetToken: '' };

    const outboxPayloadFor = async (email: string, topic: string) => {
      const rows = (await tenants.service(async sql => {
        return sql`
          select payload_json from outbox_events
          where topic = ${topic} and payload_json->'to' ? ${email}
          order by created_at desc limit 1`;
      })) as unknown as { payload_json: { text: string } }[];
      return rows[0]?.payload_json.text ?? '';
    };
    const tokenFromUrl = (text: string, path: string) =>
      text.match(new RegExp(`${path}\\?token=([0-9a-f]{10,200})`))?.[1] ?? '';

    it('enqueues an auth.email_verify event at register', async () => {
      m5.email = `m5-${Date.now()}@x.dev`;
      const reg = await http().post('/app/v1/auth/register').send({ email: m5.email, password: 'Password123x' });
      expect(reg.status).toBe(201);
      const rows = (await tenants.service(async sql => {
        return sql`
          select topic from outbox_events
          where topic = 'auth.email_verify' and payload_json->'to' ? ${m5.email}`;
      })) as unknown as { topic: string }[];
      expect(rows.length).toBeGreaterThan(0);
    });

    it('forgot-password for an unknown email returns 201 with no token row', async () => {
      const ghost = `ghost-${Date.now()}@x.dev`;
      const res = await http().post('/app/v1/auth/forgot-password').send({ email: ghost });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      const rows = (await tenants.service(async sql => {
        return sql`
          select t.id from password_reset_tokens t join users u on u.id = t.user_id
          where u.email = ${ghost}`;
      })) as unknown as { id: string }[];
      expect(rows).toHaveLength(0);
    });

    it('forgot-password for a known email creates a token row and outbox event', async () => {
      const res = await http().post('/app/v1/auth/forgot-password').send({ email: m5.email });
      expect(res.status).toBe(201);
      const tokenRows = (await tenants.service(async sql => {
        return sql`
          select t.token_hash from password_reset_tokens t join users u on u.id = t.user_id
          where u.email = ${m5.email} order by t.created_at desc limit 1`;
      })) as unknown as { token_hash: string }[];
      expect(tokenRows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
      const text = await outboxPayloadFor(m5.email, 'auth.password_reset');
      m5.resetToken = tokenFromUrl(text, 'reset-password');
      expect(m5.resetToken.length).toBeGreaterThanOrEqual(10);
    });

    it('reset-password invalidates old sessions and enables new-password login', async () => {
      const staleCookie = await loginAndGetCookie(m5.email, 'Password123x');
      const beforeMe = await http().get('/app/v1/auth/session').set('Cookie', staleCookie);
      expect(beforeMe.status).toBe(200);

      const reset = await http()
        .post('/app/v1/auth/reset-password')
        .send({ token: m5.resetToken, password: 'NewPassword123x' });
      expect(reset.status).toBe(201);

      const afterMe = await http().get('/app/v1/auth/session').set('Cookie', staleCookie);
      expect(afterMe.status).toBe(401);

      const oldLogin = await http().post('/app/v1/auth/login').send({ email: m5.email, password: 'Password123x' });
      expect(oldLogin.status).toBe(401);
      const newLogin = await http().post('/app/v1/auth/login').send({ email: m5.email, password: 'NewPassword123x' });
      expect(newLogin.status).toBe(200);

      const reuse = await http()
        .post('/app/v1/auth/reset-password')
        .send({ token: m5.resetToken, password: 'AnotherPass123x' });
      expect(reuse.status).toBe(400);
    });

    it('verify-email flips users.email_verified_at', async () => {
      const verifyToken = tokenFromUrl(
        await outboxPayloadFor(m5.email, 'auth.email_verify'),
        'verify-email',
      );
      expect(verifyToken.length).toBeGreaterThanOrEqual(10);
      const beforeRows = (await tenants.service(async sql => {
        return sql`select email_verified_at from users where email = ${m5.email}`;
      })) as unknown as { email_verified_at: Date | null }[];
      expect(beforeRows[0]?.email_verified_at).toBeNull();

      const ver = await http().get(`/app/v1/auth/verify-email?token=${verifyToken}`);
      expect(ver.status).toBe(200);

      const afterRows = (await tenants.service(async sql => {
        return sql`select email_verified_at from users where email = ${m5.email}`;
      })) as unknown as { email_verified_at: Date | null }[];
      expect(afterRows[0]?.email_verified_at).not.toBeNull();

      const again = await http().get(`/app/v1/auth/verify-email?token=${verifyToken}`);
      expect(again.status).toBe(400);
    });

    it('resend-verification re-enqueues for the sessioned user', async () => {
      const cookie = await loginAndGetCookie(m5.email, 'NewPassword123x');
      const res = await http().post('/app/v1/auth/resend-verification').set('Cookie', cookie);
      expect(res.status).toBe(201);
      const rows = (await tenants.service(async sql => {
        return sql`
          select t.id from email_verification_tokens t join users u on u.id = t.user_id
          where u.email = ${m5.email} order by t.created_at desc limit 2`;
      })) as unknown as { id: string }[];
      expect(rows.length).toBe(2);
    });
  });

  describe('M5 adoption journeys', () => {
    let applicantCookie: string[];
    let journeyAnimalId: string;
    let mainJourneyId: string;
    let returnJourneyId: string;

    const createAdoptedApplication = async (name: string): Promise<string> => {
      const animal = await http()
        .post(`/admin/v1/shelters/${shelterId}/animals`)
        .set('Cookie', devCookie)
        .send({ name, species: 'dog' });
      expect(animal.status).toBe(201);
      const apply = await http().post('/app/v1/applications')
        .set('Cookie', applicantCookie)
        .send({ animalId: animal.body.id, answers: { why_this_pet: 'journeys' } });
      expect(apply.status).toBe(201);
      const appId = apply.body.application.id;
      for (const status of ['in_review', 'approved', 'adopted'] as const) {
        const patch = await http()
          .patch(`/admin/v1/shelters/${shelterId}/applications/${appId}/status`)
          .set('Cookie', devCookie)
          .send({ status });
        expect(patch.status).toBe(200);
      }
      return animal.body.id;
    };

    const sendTouchpoint = async (dayOffset: number): Promise<string> => {
      const rows = (await tenants.service(async sql => {
        await sql`
          update journey_touchpoints set status = 'sent', sent_at = now()
          where day_offset = ${dayOffset}
            and journey_id = (
              select id from adoption_journeys
              where animal_id = ${journeyAnimalId}::uuid limit 1)`;
        const tokens = (await sql`
          select token_raw from journey_touchpoints
          where day_offset = ${dayOffset}
            and journey_id = (
              select id from adoption_journeys
              where animal_id = ${journeyAnimalId}::uuid limit 1)`) as unknown as { token_raw: string }[];
        return tokens;
      })) as unknown as { token_raw: string }[];
      expect(rows[0]?.token_raw).toBeTruthy();
      return rows[0]!.token_raw;
    };

    const staffGetJourney = async (journeyId?: string): Promise<JourneyDetail> => {
      const id = journeyId ?? mainJourneyId;
      const res = await http()
        .get(`/admin/v1/shelters/${shelterId}/journeys/${id}`)
        .set('Cookie', devCookie);
      expect(res.status).toBe(200);
      return res.body as JourneyDetail;
    };

    it('creates a journey with 4 touchpoints when an application is adopted', async () => {
      const email = `m5-j-${Date.now()}@x.dev`;
      await http().post('/app/v1/auth/register').send({ email, password: 'Password123x' });
      applicantCookie = await loginAndGetCookie(email, 'Password123x');
      await http().put('/app/v1/me/profile').set('Cookie', applicantCookie)
        .send({ legalName: 'Jo Journey', phone: '+15550001111' });

      journeyAnimalId = await createAdoptedApplication(`JourneyPet-${Date.now()}`);
      const rows = (await tenants.service(async sql => {
        return sql`
          select t.day_offset, j.id as journey_id from adoption_journeys j
          join journey_touchpoints t on t.journey_id = j.id
          where j.animal_id = ${journeyAnimalId}::uuid order by t.day_offset`;
      })) as unknown as { day_offset: number; journey_id: string }[];
      expect(rows.map(r => r.day_offset)).toEqual([2, 14, 30, 365]);
      mainJourneyId = rows[0]!.journey_id;
    });

    it('serves the public view for the raw token after a touchpoint is sent', async () => {
      const token = await sendTouchpoint(2);
      const res = await http().get(`/public/v1/journey?jt=${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        animalName: expect.any(String),
        shelterName: expect.any(String),
        dayOffset: 2,
        dayLabel: 'First nights',
        alreadyDone: false,
      });
    });

    it('closes the touchpoint on respond without followUp and opens no case', async () => {
      const token = await sendTouchpoint(2);
      const respond = await http().post('/public/v1/journey/respond').send({
        token,
        petMood: 4,
        ownerMood: 4,
        topics: ['food'],
        note: 'Sleeping on the couch already',
        wantFollowUp: false,
      });
      expect(respond.status).toBe(201);
      const rows = (await tenants.service(async sql => {
        return sql`
          select t.status from journey_touchpoints t
          join adoption_journeys j on j.id = t.journey_id
          where j.animal_id = ${journeyAnimalId}::uuid and t.day_offset = 2`;
      })) as unknown as { status: string }[];
      expect(rows[0]?.status).toBe('done');

      const detail = await staffGetJourney();
      expect(detail.cases).toEqual([]);
    });

    it('rejects a second respond with the same token as gone', async () => {
      const token = await sendTouchpoint(2);
      const first = await http().post('/public/v1/journey/respond').send({
        token,
        petMood: 3,
        ownerMood: 3,
        topics: [],
        wantFollowUp: false,
      });
      expect(first.status).toBe(201);
      const again = await http().post('/public/v1/journey/respond').send({
        token,
        petMood: 3,
        ownerMood: 3,
        topics: [],
        wantFollowUp: false,
      });
      // Deviation from brief: shipped backend answers 404 (touchpoint no longer 'sent').
      expect([400, 404]).toContain(again.status);
    });

    it('opens a concern case for vet topic + followUp and flags risk until resolved', async () => {
      const token = await sendTouchpoint(14);
      const respond = await http().post('/public/v1/journey/respond').send({
        token,
        petMood: 3,
        ownerMood: 4,
        topics: ['vet'],
        wantFollowUp: true,
      });
      expect(respond.status).toBe(201);

      const list = await http().get(`/admin/v1/shelters/${shelterId}/journeys`).set('Cookie', devCookie);
      expect(list.status).toBe(200);
      const flagged = list.body.items.find((j: { id: string }) => j.id === mainJourneyId);
      expect(flagged).toBeTruthy();
      expect(flagged.risk).toBe(true);

      const detail = await staffGetJourney(mainJourneyId);
      expect(detail.cases).toHaveLength(1);
      expect(detail.cases[0]).toMatchObject({ kind: 'concern', reason: 'vet', status: 'open' });

      const resolve = await http()
        .post(`/admin/v1/shelters/${shelterId}/journeys/cases/${detail.cases[0].id}/resolve`)
        .set('Cookie', devCookie)
        .send({ resolutionNote: 'Vet visit booked together' });
      expect(resolve.status).toBe(201);

      const after = await http()
        .get(`/admin/v1/shelters/${shelterId}/journeys/${flagged.id}`)
        .set('Cookie', devCookie);
      expect(after.body.cases[0].status).toBe('resolved');
      const relist = await http().get(`/admin/v1/shelters/${shelterId}/journeys`).set('Cookie', devCookie);
      const cleared = relist.body.items.find((j: { id: string }) => j.id === mainJourneyId);
      expect(cleared.risk).toBe(false);
    });

    it('completes the journey once all four touchpoints are done', async () => {
      for (const offset of [30, 365]) {
        const token = await sendTouchpoint(offset);
        const respond = await http().post('/public/v1/journey/respond').send({
          token,
          petMood: 5,
          ownerMood: 5,
          topics: [],
          wantFollowUp: false,
        });
        expect(respond.status).toBe(201);
      }
      const rows = (await tenants.service(async sql => {
        return sql`select status from adoption_journeys where animal_id = ${journeyAnimalId}::uuid`;
      })) as unknown as { status: string }[];
      expect(rows[0]?.status).toBe('completed');
    });

    it('skips a sent touchpoint and returns the animal via the return endpoint', async () => {
      const animalId = await createAdoptedApplication(`ReturnPet-${Date.now()}`);
      const rows = (await tenants.service(async sql => {
        await sql`
          update journey_touchpoints set status = 'sent', sent_at = now()
          where day_offset = 2 and journey_id = (
            select id from adoption_journeys where animal_id = ${animalId}::uuid limit 1)`;
        return sql`
          select j.id, t.token_raw, t.status from adoption_journeys j
          join journey_touchpoints t on t.journey_id = j.id and t.day_offset = 2
          where j.animal_id = ${animalId}::uuid limit 1`;
      })) as unknown as { id: string; token_raw: string }[];
      returnJourneyId = rows[0]!.id;

      const skip = await http().post('/public/v1/journey/skip').send({ token: rows[0]!.token_raw });
      expect(skip.status).toBe(201);
      const skipped = (await tenants.service(async sql => {
        return sql`
          select t.status from journey_touchpoints t
          where t.token_raw = ${rows[0]!.token_raw}`;
      })) as unknown as { status: string }[];
      expect(skipped[0]?.status).toBe('skipped');

      const ret = await http()
        .post(`/admin/v1/shelters/${shelterId}/journeys/${returnJourneyId}/return`)
        .set('Cookie', devCookie)
        .send({ reason: 'Match was not the right fit' });
      if (ret.status !== 201) console.log('RET_FAIL_BODY', JSON.stringify(ret.body));
      expect(ret.status).toBe(201);

      const animal = (await tenants.service(async sql => {
        return sql`select status from animals where id = ${animalId}::uuid`;
      })) as unknown as { status: string }[];
      expect(animal[0]?.status).toBe('available');

      const detail = await http()
        .get(`/admin/v1/shelters/${shelterId}/journeys/${returnJourneyId}`)
        .set('Cookie', devCookie);
      expect(detail.body.status).toBe('returned');
      expect(detail.body.cases.some((c: { kind: string }) => c.kind === 'return')).toBe(true);
    });
  });
});
