/**
 * RLS integration tests. Require a running database (docker compose up db)
 * and TEST_DATABASE_URL pointing at the NON-superuser app role, e.g.
 * TEST_DATABASE_URL=postgres://kithlink_app:kithlink_app_dev@localhost:5432/kithlink
 * Skipped when the variable is absent so `pnpm test` works offline in CI lanes.
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, withTenantContext, type DbHandles } from '../src/client';

const url = process.env.TEST_DATABASE_URL;

let owner: postgres.Sql;
let handles: DbHandles;
const shelterA = randomUUID();
const shelterB = randomUUID();
const userA = randomUUID();
const nameA = `Rex-A-${randomUUID().slice(0, 8)}`;
const nameB = `Bella-B-${randomUUID().slice(0, 8)}`;

async function insertShelter(sql: postgres.Sql, id: string, slug: string) {
  await sql`INSERT INTO shelters (id, slug, name) VALUES (${id}, ${slug}, ${slug})`;
}
async function insertAnimal(sql: postgres.Sql, shelterId: string, name: string) {
  await sql`INSERT INTO animals (shelter_id, name, species) VALUES (${shelterId}, ${name}, 'dog')`;
}

describe.skipIf(!url)('row level security', () => {
  beforeAll(async () => {
    owner = postgres(process.env.DATABASE_OWNER_URL!, { max: 1 });
    handles = createDb(url!);
    await insertShelter(owner, shelterA, `a-${shelterA.slice(0, 8)}`);
    await insertShelter(owner, shelterB, `b-${shelterB.slice(0, 8)}`);
    await owner`INSERT INTO users (id, email) VALUES (${userA}, ${`u-${userA}@test.dev`})`;
    await owner`INSERT INTO staff_members (shelter_id, user_id, role) VALUES (${shelterA}, ${userA}, 'owner')`;
    await insertAnimal(owner, shelterA, nameA);
    await insertAnimal(owner, shelterB, nameB);
  });

  afterAll(async () => {
    await owner`DELETE FROM animals WHERE shelter_id IN (${shelterA}, ${shelterB})`;
    await owner`DELETE FROM shelters WHERE id IN (${shelterA}, ${shelterB})`;
    await owner`DELETE FROM users WHERE id = ${userA}`;
    await owner.end();
    await handles.sql.end();
  });

  it('scopes staff reads to their tenant', async () => {
    const names = await withTenantContext(
      handles,
      { userId: userA, shelterId: shelterA },
      tx => tx<{ name: string }[]>`SELECT name FROM animals ORDER BY name`,
    );
    expect(names.map(r => r.name)).toEqual([nameA]);
  });

  it('returns nothing without tenant context', async () => {
    const rows = await withTenantContext(handles, {}, tx => tx`SELECT * FROM animals`);
    expect(rows).toHaveLength(0);
  });

  it('blocks cross-tenant writes', async () => {
    await expect(
      withTenantContext(handles, { userId: userA, shelterId: shelterA }, tx =>
        tx`UPDATE animals SET name = 'hacked' WHERE shelter_id = ${shelterB}`,
      ),
    ).resolves.toHaveProperty('count', 0);
  });

  it('allows service context full read', async () => {
    const names = await withTenantContext(handles, { roleClass: 'service' }, async tx => {
      const rows = await tx<{ name: string }[]>`SELECT name FROM animals`;
      return rows.map(r => r.name);
    });
    expect(names).toContain(nameA);
    expect(names).toContain(nameB);
  });

  it('allows service reads but blocks staff reads of audit_logs', async () => {
    await withTenantContext(handles, { roleClass: 'service' }, tx =>
      tx`INSERT INTO audit_logs (action, entity_type, hash) VALUES ('t','t',${randomUUID()})`,
    );
    const svcRows = await withTenantContext(handles, { roleClass: 'service' }, tx =>
      tx`SELECT * FROM audit_logs`,
    );
    expect(svcRows.length).toBeGreaterThan(0);
    const staffRows = await withTenantContext(
      handles,
      { userId: userA, shelterId: shelterA },
      tx => tx`SELECT * FROM audit_logs`,
    );
    expect(staffRows).toHaveLength(0);
  });

  it('exposes only available animals to anonymous public context', async () => {
    await owner`UPDATE animals SET status = 'adopted' WHERE name = ${nameB}`;
    const names = await withTenantContext(handles, { roleClass: 'anonymous' }, async tx => {
      const rows = await tx<{ name: string }[]>`SELECT name FROM animals`;
      return rows.map(r => r.name);
    });
    expect(names).toContain(nameA);
    expect(names).not.toContain(nameB);
    await owner`UPDATE animals SET status = 'available' WHERE name = ${nameB}`;
  });
});
