-- M5 (docs/design/11 §4 items 1-3): shelter geodata for network-wide discovery.
-- Idempotent: applied by packages/db/src/migrate.ts after m4_custom_domains.sql.

ALTER TABLE shelters ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE shelters ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE shelters ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE shelters ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE shelters ADD COLUMN IF NOT EXISTS longitude double precision;
