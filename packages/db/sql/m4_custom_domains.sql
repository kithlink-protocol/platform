-- M4 (docs/design/06 §1, §5): custom domains for shelter sites.
-- Idempotent: applied by packages/db/src/migrate.ts after policies.sql.

CREATE TABLE IF NOT EXISTS "custom_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shelter_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"verification_token" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_domains_domain_unique" UNIQUE("domain")
);
DO $$ BEGIN
  ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_shelter_id_shelters_id_fk"
    FOREIGN KEY ("shelter_id") REFERENCES "shelters"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "custom_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_domains" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS custom_domains_read ON custom_domains;
CREATE POLICY custom_domains_read ON custom_domains FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  );
DROP POLICY IF EXISTS custom_domains_manage ON custom_domains;
CREATE POLICY custom_domains_manage ON custom_domains FOR ALL
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  );
