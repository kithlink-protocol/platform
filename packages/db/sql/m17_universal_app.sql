-- m17: Universal application profile + rental property registry
-- (docs/design/13-universal-application.md).
-- Hand-idempotent: safe to re-run on every migrate.

ALTER TABLE applicant_profiles
  ADD COLUMN IF NOT EXISTS universal_application jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS rental_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name text NOT NULL,
  display_name text NOT NULL,
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  pet_policy jsonb NOT NULL DEFAULT '{}',
  submitted_by uuid REFERENCES users(id),
  confirmed_count int NOT NULL DEFAULT 0,
  denied_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_properties_name_city_state_key UNIQUE (normalized_name, city, state)
);

CREATE INDEX IF NOT EXISTS rental_properties_normalized_idx
  ON rental_properties (normalized_name);

-- Shared community data: no tenant isolation. Everyone can read,
-- only the service role writes (submissions are attributed via submitted_by).
ALTER TABLE rental_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_properties FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rental_properties_public_read ON rental_properties;
CREATE POLICY rental_properties_public_read ON rental_properties FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) IN ('anonymous', 'applicant', 'staff')
    OR current_setting('kithlink.role_class', true) = 'service'
  );

DROP POLICY IF EXISTS rental_properties_service ON rental_properties;
CREATE POLICY rental_properties_service ON rental_properties FOR ALL
  USING (current_setting('kithlink.role_class', true) = 'service')
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
