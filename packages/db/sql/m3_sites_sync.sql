-- M3 (docs/design/05 §2-4, docs/design/06): CMS sites, pages, sync targets/runs.
-- Idempotent: applied by packages/db/src/migrate.ts after policies.sql.

CREATE TABLE IF NOT EXISTS "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shelter_id" uuid NOT NULL,
	"theme_slug" text DEFAULT 'default' NOT NULL,
	"brand" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hero_title" text DEFAULT '' NOT NULL,
	"hero_body" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "sites_shelter_id_unique" UNIQUE("shelter_id"),
	CONSTRAINT "sites_theme_check" CHECK ("sites"."theme_slug" IN ('default','rescue-min'))
);
DO $$ BEGIN
  ALTER TABLE "sites" ADD CONSTRAINT "sites_shelter_id_shelter_id_fk"
    FOREIGN KEY ("shelter_id") REFERENCES "shelters"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "site_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"blocks_jsonb" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_pages_slug_check" CHECK ("site_pages"."slug" IN ('about','faq','contact'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "site_pages_site_slug_idx" ON "site_pages" ("site_id","slug");
DO $$ BEGIN
  ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_site_id_sites_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "sync_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shelter_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"credentials_enc" text NOT NULL,
	"mode" text DEFAULT 'dry_run' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_run_at" timestamp with time zone,
	CONSTRAINT "sync_targets_provider_check" CHECK ("sync_targets"."provider" IN ('petfinder','adoptapet')),
	CONSTRAINT "sync_targets_mode_check" CHECK ("sync_targets"."mode" IN ('dry_run','live'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "sync_targets_shelter_provider_idx" ON "sync_targets" ("shelter_id","provider");
DO $$ BEGIN
  ALTER TABLE "sync_targets" ADD CONSTRAINT "sync_targets_shelter_id_shelter_id_fk"
    FOREIGN KEY ("shelter_id") REFERENCES "shelters"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"pushed" integer DEFAULT 0 NOT NULL,
	"pulled" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"decisions_json" jsonb DEFAULT '[]'::jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "sync_runs_target_idx" ON "sync_runs" ("target_id","started_at");
DO $$ BEGIN
  ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_target_id_sync_targets_id_fk"
    FOREIGN KEY ("target_id") REFERENCES "sync_targets"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "sites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sites" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sites_read ON sites;
CREATE POLICY sites_read ON sites FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) IN ('service','anonymous')
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  );
DROP POLICY IF EXISTS sites_write ON sites;
CREATE POLICY sites_write ON sites FOR ALL
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  );

ALTER TABLE "site_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "site_pages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_pages_read ON site_pages;
CREATE POLICY site_pages_read ON site_pages FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) IN ('service','anonymous')
    OR EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = site_pages.site_id
        AND current_setting('kithlink.shelter_id', true) = s.shelter_id::text
    )
  );
DROP POLICY IF EXISTS site_pages_write ON site_pages;
CREATE POLICY site_pages_write ON site_pages FOR ALL
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = site_pages.site_id
        AND current_setting('kithlink.shelter_id', true) = s.shelter_id::text
    )
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR EXISTS (
      SELECT 1 FROM sites s
      WHERE s.id = site_pages.site_id
        AND current_setting('kithlink.shelter_id', true) = s.shelter_id::text
    )
  );

ALTER TABLE "sync_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_targets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_targets_read ON sync_targets;
CREATE POLICY sync_targets_read ON sync_targets FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  );
DROP POLICY IF EXISTS sync_targets_manage ON sync_targets;
CREATE POLICY sync_targets_manage ON sync_targets FOR ALL
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  );

ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_runs_read ON sync_runs;
CREATE POLICY sync_runs_read ON sync_runs FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR EXISTS (
      SELECT 1 FROM sync_targets st
      WHERE st.id = sync_runs.target_id
        AND current_setting('kithlink.shelter_id', true) = st.shelter_id::text
    )
  );
DROP POLICY IF EXISTS sync_runs_manage ON sync_runs;
CREATE POLICY sync_runs_manage ON sync_runs FOR ALL
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR EXISTS (
      SELECT 1 FROM sync_targets st
      WHERE st.id = sync_runs.target_id
        AND current_setting('kithlink.shelter_id', true) = st.shelter_id::text
    )
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR EXISTS (
      SELECT 1 FROM sync_targets st
      WHERE st.id = sync_runs.target_id
        AND current_setting('kithlink.shelter_id', true) = st.shelter_id::text
    )
  );
