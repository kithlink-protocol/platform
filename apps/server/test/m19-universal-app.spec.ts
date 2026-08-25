import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { createDb, type DbHandles } from '@kithlink/db';
import {
  rentalPropertySchema,
  universalApplicationSchema,
  type RentalPropertyPublic,
  type UniversalApplication,
} from '@kithlink/contracts';
import { AppModule } from '../src/app.module';
import { ProblemFilter } from '../src/common/http-exception.filter';
import { TenantService } from '../src/modules/db.module';
import { runSeed } from '../scripts/seed';

const testUrl = process.env.TEST_DATABASE_URL;

const FULL_APPLICATION = {
  household: {
    adults: 2,
    childrenAges: [4, 7],
    allAgreed: true,
    primaryCaregiver: 'Kim Diaz',
    allergies: 'none known',
  },
  residence: {
    type: 'house',
    ownOrRent: 'rent',
    yard: true,
    fenceType: 'wood privacy',
    hoursAlonePerDay: 4,
    petLocation: 'indoors',
  },
  landlord: {
    name: 'Dana Reed',
    phone: '+15551234567',
    propertyName: 'Maple Court Apartments',
    city: 'Raleigh',
    state: 'NC',
    petPolicyKnown: true,
    petDeposit: 300,
    monthlyPetRent: 25,
    breedRestrictions: 'none',
    weightLimit: 50,
    approvalConfirmed: true,
  },
  currentPets: [{ species: 'dog', age: '3 years', spayed: true, getsAlongWith: 'cats' }],
  petHistory: {
    hadPetsBefore: true,
    previousPetsDesc: 'A lab growing up',
    everSurrendered: false,
    surrenderReason: '',
  },
  lifestyle: {
    exercisePlan: 'Daily walks and weekend hikes',
    trainingPlan: 'Positive-reinforcement classes',
    behaviorPlan: 'Work with a certified trainer',
    transportPlan: 'Own car',
    careIfUnable: 'Family nearby can help',
  },
  preferences: {
    sexPreference: 'female',
    sizePreference: 'medium',
    ageRange: '1-5 years',
    traitsWanted: 'calm, friendly with kids',
  },
  vetCare: {
    currentVet: 'Dr. Patel',
    financialReady: true,
    insuranceConsidered: false,
  },
} as const;

describe.skipIf(!testUrl)('m19 universal application + rental properties', () => {
  let app: INestApplication;
  let tenants: TenantService;
  let handles: DbHandles;
  let cookieA: string[];
  let cookieB: string[];
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
    cookieA = await registerAndLogin(`m19-a-${run}@x.dev`);
    cookieB = await registerAndLogin(`m19-b-${run}@x.dev`);
  }, 30000);

  afterAll(async () => {
    await app?.close();
    await handles?.sql.end({ timeout: 5 });
  });

  const http = () => request(app.getHttpServer());

  async function registerAndLogin(email: string): Promise<string[]> {
    const reg = await http()
      .post('/app/v1/auth/register')
      .send({ email, password: 'Password123x' });
    expect([200, 201]).toContain(reg.status);
    const login = await http()
      .post('/app/v1/auth/login')
      .send({ email, password: 'Password123x' });
    expect(login.status).toBe(200);
    return login.headers['set-cookie'];
  }

  async function submitRental(
    cookie: string[],
    displayName: string,
  ): Promise<RentalPropertyPublic> {
    const res = await http()
      .post('/app/v1/me/rental-properties')
      .set('Cookie', cookie)
      .send({
        displayName,
        city: 'Cary',
        state: 'NC',
        petPolicy: { allowed: true, deposit: 250, monthlyRent: 20 },
      });
    expect([200, 201]).toContain(res.status);
    return rentalPropertySchema.parse(res.body);
  }

  it('rejects unauthenticated access to application and submission routes', async () => {
    expect((await http().get('/app/v1/me/universal-application')).status).toBe(401);
    expect(
      (await http().put('/app/v1/me/universal-application').send(FULL_APPLICATION)).status,
    ).toBe(401);
    expect(
      (await http().post('/app/v1/me/rental-properties').send({ displayName: 'Nope' })).status,
    ).toBe(401);
  });

  it('saves a full universal application and returns it on GET', async () => {
    const put = await http()
      .put('/app/v1/me/universal-application')
      .set('Cookie', cookieA)
      .send(FULL_APPLICATION);
    expect(put.status).toBe(200);

    const got = await http().get('/app/v1/me/universal-application').set('Cookie', cookieA);
    expect(got.status).toBe(200);
    const parsed: UniversalApplication = universalApplicationSchema.parse(got.body);
    expect(parsed.household?.adults).toBe(2);
    expect(parsed.household?.childrenAges).toEqual([4, 7]);
    expect(parsed.residence?.type).toBe('house');
    expect(parsed.landlord?.petDeposit).toBe(300);
    expect(parsed.currentPets?.[0]?.species).toBe('dog');
    expect(parsed.preferences?.sizePreference).toBe('medium');
    expect(parsed.vetCare?.financialReady).toBe(true);
    expect(universalApplicationSchema.parse(FULL_APPLICATION)).toEqual(parsed);
  }, 15000);

  it('partial PUT preserves other sections and merges within a section', async () => {
    await http()
      .put('/app/v1/me/universal-application')
      .set('Cookie', cookieB)
      .send(FULL_APPLICATION);

    const sectionPatch = await http()
      .put('/app/v1/me/universal-application')
      .set('Cookie', cookieB)
      .send({ vetCare: { currentVet: 'Dr. Chang' } });
    expect(sectionPatch.status).toBe(200);
    const body = universalApplicationSchema.parse(sectionPatch.body);
    expect(body.vetCare?.currentVet).toBe('Dr. Chang');
    expect(body.vetCare?.financialReady).toBe(true);
    expect(body.household?.adults).toBe(2);

    const fieldPatch = await http()
      .put('/app/v1/me/universal-application')
      .set('Cookie', cookieB)
      .send({ household: { allergies: 'pollen' } });
    expect(fieldPatch.status).toBe(200);
    const merged = universalApplicationSchema.parse(fieldPatch.body);
    expect(merged.household?.allergies).toBe('pollen');
    expect(merged.household?.childrenAges).toEqual([4, 7]);
    expect(merged.residence?.fenceType).toBe('wood privacy');

    const got = await http().get('/app/v1/me/universal-application').set('Cookie', cookieB);
    const persisted = universalApplicationSchema.parse(got.body);
    expect(persisted.vetCare?.currentVet).toBe('Dr. Chang');
    expect(persisted.household?.allergies).toBe('pollen');
  }, 15000);

  it('searches rental properties by fuzzy name without auth', async () => {
    const created = await submitRental(cookieA, `Willow Bend Flats ${run}`);

    const search = await http()
      .get(`/public/v1/rental-properties/search?q=${encodeURIComponent('willow bend')}`);
    expect(search.status).toBe(200);
    const items = (search.body as RentalPropertyPublic[]).filter(
      p => p.id === created.id || p.displayName.startsWith('Willow Bend Flats'),
    );
    expect(items.length).toBeGreaterThanOrEqual(1);
    const match = rentalPropertySchema.parse(items.find(p => p.id === created.id));
    expect(match.displayName).toBe(`Willow Bend Flats ${run}`);
    expect(match.petPolicy.allowed).toBe(true);
    expect(match.city).toBe('Cary');
  }, 15000);

  it('narrows results by city filter', async () => {
    await submitRental(cookieA, `Ashton Park Homes ${run}`);
    const miss = await http().get(
      `/public/v1/rental-properties/search?q=ashton%20park&city=Durham`,
    );
    expect(miss.status).toBe(200);
    expect((miss.body as RentalPropertyPublic[]).some(p => p.displayName === `Ashton Park Homes ${run}`)).toBe(false);

    const hit = await http().get(`/public/v1/rental-properties/search?q=ashton%20park&city=cary`);
    expect(hit.status).toBe(200);
    expect((hit.body as RentalPropertyPublic[]).some(p => p.displayName === `Ashton Park Homes ${run}`)).toBe(true);
  }, 15000);

  it('conflicting submissions increment confirmed_count instead of duplicating rows', async () => {
    const name = `Harbor Point Lofts ${run}`;
    const first = await submitRental(cookieA, name);
    expect(first.confirmedCount).toBeGreaterThanOrEqual(0);

    const second = await submitRental(cookieB, name);
    expect(second.id).toBe(first.id);
    expect(second.confirmedCount).toBe(first.confirmedCount + 1);

    const search = await http().get(
      `/public/v1/rental-properties/search?q=${encodeURIComponent(name)}`,
    );
    const rows = search.body as RentalPropertyPublic[];
    expect(rows.filter(p => p.displayName === name)).toHaveLength(1);
  }, 15000);

  it('keeps tenant contexts clean around audit writes', async () => {
    const audits = (await tenants.service(async sql => {
      return (await sql`
        select action from audit_logs
        where action in ('universal_application.updated', 'rental_property.submitted')
        order by created_at desc limit 10`) as unknown as { action: string }[];
    })) as unknown as { action: string }[];
    const actions = new Set(audits.map(a => a.action));
    expect(actions.has('universal_application.updated')).toBe(true);
    expect(actions.has('rental_property.submitted')).toBe(true);
  }, 15000);
});
