import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const MIGRATIONS_DIR = join(__dirname, '..', 'drizzle');
const SQL_DIR = join(__dirname, '..', 'sql');

function ownerUrl(): string {
  const url = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_OWNER_URL or DATABASE_URL is required');
  return url;
}

async function main(): Promise<void> {
  const sql = postgres(ownerUrl(), { max: 1 });

  try {
    await sql`CREATE EXTENSION IF NOT EXISTS citext`;

    await drizzleMigrate(drizzle(sql), { migrationsFolder: MIGRATIONS_DIR });
    console.log('[db] drizzle migrations applied');

    for (const file of ['policies.sql', 'm3_sites_sync.sql', 'm4_custom_domains.sql', 'm5_shelter_geo.sql', 'm6_application_notes.sql', 'm7_auth_tokens.sql', 'm8_adoption_journeys.sql', 'm9_review_checklist.sql', 'm10_behavior_observations.sql']) {
      let text: string;
      try {
        text = readFileSync(join(SQL_DIR, file), 'utf8');
      } catch {
        console.warn(`[db] ${file} not found, skipping`);
        continue;
      }
      await sql.unsafe(text);
      console.log(`[db] applied ${file}`);
    }
    console.log('[db] migration complete');
  } finally {
    await sql.end();
  }
}

main().catch(err => {
  console.error('[db] migration failed:', err);
  process.exit(1);
});
