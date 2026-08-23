-- m11: foster network portal (docs/design/12 §M8).
-- Foster-home profiles, placements, and check-in updates; reminders ride the outbox.
-- Hand-idempotent: safe to re-run on every migrate.

CREATE TABLE IF NOT EXISTS foster_homes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shelter_id uuid NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  home_name text NOT NULL,
  primary_contact_email text NOT NULL,
  capacity int NOT NULL DEFAULT 1 CHECK (capacity >= 1 AND capacity <= 20),
  -- residentPets / children / fencedYard booleans.
  environment jsonb NOT NULL DEFAULT '{}',
  skills text[] NOT NULL DEFAULT '{}'
    CHECK (skills <@ ARRAY['neonatal','post_op','reactive','medical','behavior']::text[]),
  active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS foster_homes_shelter_idx
  ON foster_homes (shelter_id, active);

ALTER TABLE foster_homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE foster_homes FORCE ROW LEVEL SECURITY;
-- NULLIF guards the empty-string default of the shelter GUC: casting '' to uuid throws.
DROP POLICY IF EXISTS foster_homes_select ON foster_homes;
CREATE POLICY foster_homes_select ON foster_homes FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND foster_homes.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS foster_homes_insert ON foster_homes;
CREATE POLICY foster_homes_insert ON foster_homes FOR INSERT
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND foster_homes.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS foster_homes_update ON foster_homes;
CREATE POLICY foster_homes_update ON foster_homes FOR UPDATE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND foster_homes.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND foster_homes.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS foster_homes_delete ON foster_homes;
CREATE POLICY foster_homes_delete ON foster_homes FOR DELETE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND foster_homes.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );

CREATE TABLE IF NOT EXISTS foster_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shelter_id uuid NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  home_id uuid NOT NULL REFERENCES foster_homes(id) ON DELETE CASCADE,
  -- RESTRICT: losing the animals row must not silently erase placement history.
  animal_id uuid NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  next_check_in timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  checkin_1_sent bool NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS foster_placements_shelter_idx
  ON foster_placements (shelter_id, status, next_check_in);
CREATE INDEX IF NOT EXISTS foster_placements_sweep_idx
  ON foster_placements (next_check_in) WHERE status = 'active' AND checkin_1_sent = false;

ALTER TABLE foster_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE foster_placements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS foster_placements_select ON foster_placements;
CREATE POLICY foster_placements_select ON foster_placements FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND foster_placements.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS foster_placements_insert ON foster_placements;
CREATE POLICY foster_placements_insert ON foster_placements FOR INSERT
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND foster_placements.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS foster_placements_update ON foster_placements;
CREATE POLICY foster_placements_update ON foster_placements FOR UPDATE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND foster_placements.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND foster_placements.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS foster_placements_delete ON foster_placements;
CREATE POLICY foster_placements_delete ON foster_placements FOR DELETE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND foster_placements.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );

CREATE TABLE IF NOT EXISTS foster_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL REFERENCES foster_placements(id) ON DELETE CASCADE,
  notes text NOT NULL,
  concerns bool NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS foster_updates_placement_idx
  ON foster_updates (placement_id, created_at DESC);

ALTER TABLE foster_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE foster_updates FORCE ROW LEVEL SECURITY;
-- Public check-in submissions write through the service context; staff get
-- own-shelter SELECT via the placement's denormalized shelter_id.
DROP POLICY IF EXISTS foster_updates_select ON foster_updates;
CREATE POLICY foster_updates_select ON foster_updates FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM foster_placements p
        WHERE p.id = foster_updates.placement_id
          AND p.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  );
DROP POLICY IF EXISTS foster_updates_insert ON foster_updates;
CREATE POLICY foster_updates_insert ON foster_updates FOR INSERT
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS foster_updates_update ON foster_updates;
CREATE POLICY foster_updates_update ON foster_updates FOR UPDATE
  USING (current_setting('kithlink.role_class', true) = 'service')
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS foster_updates_delete ON foster_updates;
CREATE POLICY foster_updates_delete ON foster_updates FOR DELETE
  USING (current_setting('kithlink.role_class', true) = 'service');
