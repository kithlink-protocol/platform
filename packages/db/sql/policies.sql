-- Row Level Security: tenancy backstop (docs/design/02 §3).
-- App connects as non-superuser role `kithlink_app` (see deploy/compose/initdb).
-- FORCE makes even the table owner obey policies on DML; DDL is unaffected.
-- This file is idempotent: safe to re-run on every migrate.

ALTER TABLE shelters ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shelters_read ON shelters;
CREATE POLICY shelters_read ON shelters FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) IN ('service','anonymous')
    OR current_setting('kithlink.shelter_id', true) = id::text
  );
DROP POLICY IF EXISTS shelters_write ON shelters;
CREATE POLICY shelters_write ON shelters FOR ALL
  USING (current_setting('kithlink.role_class', true) = 'service')
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_self ON users;
CREATE POLICY users_self ON users FOR SELECT
  USING (
    current_setting('kithlink.user_id', true) = id::text
    OR current_setting('kithlink.role_class', true) = 'service'
  );
DROP POLICY IF EXISTS users_service ON users;
CREATE POLICY users_service ON users FOR INSERT
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS users_service_update ON users;
CREATE POLICY users_service_update ON users FOR UPDATE
  USING (current_setting('kithlink.role_class', true) = 'service')
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_read ON sessions;
CREATE POLICY sessions_read ON sessions FOR SELECT
  USING (
    current_setting('kithlink.user_id', true) = user_id::text
    OR current_setting('kithlink.role_class', true) = 'service'
  );
DROP POLICY IF EXISTS sessions_write ON sessions;
CREATE POLICY sessions_write ON sessions FOR INSERT
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS sessions_touch ON sessions;
CREATE POLICY sessions_touch ON sessions FOR UPDATE
  USING (current_setting('kithlink.role_class', true) = 'service')
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_membership ON staff_members;
CREATE POLICY staff_membership ON staff_members FOR SELECT
  USING (
    current_setting('kithlink.user_id', true) = user_id::text
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
    OR current_setting('kithlink.role_class', true) = 'service'
  );
DROP POLICY IF EXISTS staff_manage ON staff_members;
CREATE POLICY staff_manage ON staff_members FOR ALL
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  );

ALTER TABLE animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE animals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS animals_tenant ON animals;
CREATE POLICY animals_tenant ON animals FOR ALL
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.shelter_id', true) = shelter_id::text
  );
-- Anonymous public registry: ONLY available animals, nothing else.
DROP POLICY IF EXISTS animals_public_read ON animals;
CREATE POLICY animals_public_read ON animals FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'anonymous'
    AND status = 'available'
  );

ALTER TABLE animal_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE animal_photos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS photos_tenant ON animal_photos;
CREATE POLICY photos_tenant ON animal_photos FOR ALL
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR EXISTS (
      SELECT 1 FROM animals a
      WHERE a.id = animal_photos.animal_id
        AND (
          current_setting('kithlink.shelter_id', true) = a.shelter_id::text
          OR (current_setting('kithlink.role_class', true) = 'anonymous' AND a.status = 'available')
        )
    )
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR EXISTS (
      SELECT 1 FROM animals a
      WHERE a.id = animal_photos.animal_id
        AND current_setting('kithlink.shelter_id', true) = a.shelter_id::text
    )
  );

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_insert ON audit_logs;
CREATE POLICY audit_insert ON audit_logs FOR INSERT
  WITH CHECK (true);
DROP POLICY IF EXISTS audit_read ON audit_logs;
CREATE POLICY audit_read ON audit_logs FOR SELECT
  USING (current_setting('kithlink.role_class', true) = 'service');
-- staff/applicant contexts can neither update nor delete (no policies).

CREATE INDEX IF NOT EXISTS animals_fts_idx ON animals USING gin(fts);
