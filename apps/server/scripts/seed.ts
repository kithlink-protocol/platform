import { hash } from '@node-rs/argon2';
import { createDb, withTenantContext, type DbHandles } from '@kithlink/db';

interface SeedAnimal {
  name: string;
  species: string;
  breed: string | null;
  birthYear: number;
  sex: string;
  size: string | null;
  status: string;
  description: string;
}

const SEED_ANIMALS: SeedAnimal[] = [
  { name: 'Rex', species: 'dog', breed: 'Labrador mix', birthYear: 2022, sex: 'male', size: 'large', status: 'available', description: 'Ball is life.' },
  { name: 'Mochi', species: 'cat', breed: null, birthYear: 2023, sex: 'female', size: null, status: 'available', description: 'Lap cat extraordinaire.' },
  { name: 'Bruno', species: 'dog', breed: 'Beagle', birthYear: 2021, sex: 'male', size: 'medium', status: 'pending', description: 'Professional sniffer.' },
  { name: 'Luna', species: 'cat', breed: 'Siamese', birthYear: 2020, sex: 'female', size: null, status: 'adopted', description: 'Already home.' },
  { name: 'Pepper', species: 'other', breed: 'Holland Lop', birthYear: 2024, sex: 'unknown', size: 'small', status: 'available', description: 'Hop enthusiast.' },
  { name: 'Daisy', species: 'dog', breed: 'Border Collie', birthYear: 2023, sex: 'female', size: 'medium', status: 'draft', description: 'Profile in progress.' },
];

export async function runSeed(handles: DbHandles): Promise<void> {
  await withTenantContext(handles, { roleClass: 'service' }, async sql => {
    const shelterRows = (await sql`
      insert into shelters (slug, name) values ('happytail', 'Happytail Rescue')
      on conflict (slug) do update set name = excluded.name
      returning id`) as unknown as { id: string }[];
    const shelterId = shelterRows[0]!.id;
    const passwordHash = await hash('DevOnly123!x');
    const ownerRows = (await sql`
      insert into users (email, password_hash, email_verified_at)
      values ('dev@kithlink.dev', ${passwordHash}, now())
      on conflict (email) do update set password_hash = excluded.password_hash
      returning id`) as unknown as { id: string }[];
    const ownerId = ownerRows[0]!.id;
    await sql`
      insert into staff_members (shelter_id, user_id, role)
      values (${shelterId}, ${ownerId}, 'owner')
      on conflict do nothing`;
    const counts = (await sql`select count(*)::int as n from animals where shelter_id = ${shelterId}`) as unknown as {
      n: number;
    }[];
    if ((counts[0]?.n ?? 0) > 0) return;
    for (const animal of SEED_ANIMALS) {
      await sql`
        insert into animals (shelter_id, name, species, breed, birth_year, sex, size, status, description)
        values (${shelterId}, ${animal.name}, ${animal.species}, ${animal.breed}, ${animal.birthYear},
                ${animal.sex}, ${animal.size}, ${animal.status}, ${animal.description})`;
    }
  });
  await handles.sql.end({ timeout: 5 });
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  await runSeed(createDb(url));
}

const isDirectRun = (process.argv[1] ?? '').endsWith('seed.ts');
if (isDirectRun) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
