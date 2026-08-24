import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandles } from '@kithlink/db';
import { AppModule } from '../src/app.module';
import { TenantService } from '../src/modules/db.module';

let app: INestApplication;
let handles: DbHandles;
let tenants: TenantService;
let shelterId = '';
let ownerCookie: string[] = [];

const testUrl = process.env.TEST_DATABASE_URL;

beforeAll(async () => {
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required for this spec');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  handles = createDb(process.env.TEST_DATABASE_URL!);
  tenants = app.get(TenantService);

  const ht = (await tenants.service(async sql => {
    return sql`select id from shelters where slug = 'happytail' limit 1`;
  })) as unknown as { id: string }[];
  if (ht[0]) shelterId = ht[0].id;

  const loginRes = await request(app.getHttpServer())
    .post('/app/v1/auth/login')
    .send({ email: 'dev@kithlink.dev', password: 'DevOnly123!x' });
  expect(loginRes.status).toBe(200);
  ownerCookie = loginRes.headers['set-cookie'];
});

afterAll(async () => {
  await app?.close();
  await handles?.sql.end({ timeout: 5 });
});

describe('reports csv endpoints', () => {
  it('outcomes.csv returns 200 with csv content-type', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/v1/shelters/${shelterId}/reports/outcomes.csv`)
      .set('Cookie', ownerCookie[0]);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('status,count');
  });

  it('length-of-stay.csv returns 200 with column headers', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/v1/shelters/${shelterId}/reports/length-of-stay.csv`)
      .set('Cookie', ownerCookie[0]);
    expect(res.status).toBe(200);
    expect(res.text).toContain('animal_name');
  });

  it('checkins.csv returns 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/v1/shelters/${shelterId}/reports/checkins.csv`)
      .set('Cookie', ownerCookie[0]);
    expect(res.status).toBe(200);
  });

  it('unauthenticated access returns 401', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/v1/shelters/${shelterId}/reports/outcomes.csv`);
    expect(res.status).toBe(401);
  });
});
