-- m8: adoption journeys — M5 "Settling In" post-adoption follow-up
-- (docs/design/12-pain-points-milestones.md §M5).
-- Hand-idempotent: safe to re-run on every migrate.

CREATE TABLE IF NOT EXISTS adoption_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  animal_id uuid NOT NULL REFERENCES animals(id),
  shelter_id uuid NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  adopter_user_id uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','opted_out','returned')),
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adoption_journeys_shelter_idx
  ON adoption_journeys (shelter_id, started_at DESC);

ALTER TABLE adoption_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE adoption_journeys FORCE ROW LEVEL SECURITY;
-- NULLIF guards the empty-string default of the shelter GUC: casting '' to uuid throws.
DROP POLICY IF EXISTS adoption_journeys_select ON adoption_journeys;
CREATE POLICY adoption_journeys_select ON adoption_journeys FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND adoption_journeys.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS adoption_journeys_insert ON adoption_journeys;
CREATE POLICY adoption_journeys_insert ON adoption_journeys FOR INSERT
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND adoption_journeys.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS adoption_journeys_update ON adoption_journeys;
CREATE POLICY adoption_journeys_update ON adoption_journeys FOR UPDATE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND adoption_journeys.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND adoption_journeys.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS adoption_journeys_delete ON adoption_journeys;
CREATE POLICY adoption_journeys_delete ON adoption_journeys FOR DELETE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND adoption_journeys.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );

CREATE TABLE IF NOT EXISTS journey_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES adoption_journeys(id) ON DELETE CASCADE,
  day_offset integer NOT NULL CHECK (day_offset BETWEEN 0 AND 400),
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','sent','done','skipped')),
  -- Raw token must be reconstructable when the cron fires (up to a year later);
  -- token_hash is the lookup key. Never expose token_raw outside email URLs.
  token_raw text NOT NULL,
  token_hash text NOT NULL UNIQUE
);

-- Scheduler scan: due, unsent touchpoints.
CREATE INDEX IF NOT EXISTS journey_touchpoints_due_idx
  ON journey_touchpoints (scheduled_for ASC) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS journey_touchpoints_journey_idx
  ON journey_touchpoints (journey_id, day_offset ASC);

ALTER TABLE journey_touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_touchpoints FORCE ROW LEVEL SECURITY;
-- Tenant shape rides the parent journey's shelter (no denormalized column here).
DROP POLICY IF EXISTS journey_touchpoints_select ON journey_touchpoints;
CREATE POLICY journey_touchpoints_select ON journey_touchpoints FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM adoption_journeys j
        WHERE j.id = journey_touchpoints.journey_id
          AND j.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  );
DROP POLICY IF EXISTS journey_touchpoints_insert ON journey_touchpoints;
CREATE POLICY journey_touchpoints_insert ON journey_touchpoints FOR INSERT
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM adoption_journeys j
        WHERE j.id = journey_touchpoints.journey_id
          AND j.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  );
DROP POLICY IF EXISTS journey_touchpoints_update ON journey_touchpoints;
CREATE POLICY journey_touchpoints_update ON journey_touchpoints FOR UPDATE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM adoption_journeys j
        WHERE j.id = journey_touchpoints.journey_id
          AND j.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM adoption_journeys j
        WHERE j.id = journey_touchpoints.journey_id
          AND j.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  );
DROP POLICY IF EXISTS journey_touchpoints_delete ON journey_touchpoints;
CREATE POLICY journey_touchpoints_delete ON journey_touchpoints FOR DELETE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM adoption_journeys j
        WHERE j.id = journey_touchpoints.journey_id
          AND j.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  );

CREATE TABLE IF NOT EXISTS journey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  touchpoint_id uuid NOT NULL REFERENCES journey_touchpoints(id) ON DELETE CASCADE,
  journey_id uuid NOT NULL REFERENCES adoption_journeys(id) ON DELETE CASCADE,
  pet_mood integer NOT NULL CHECK (pet_mood BETWEEN 1 AND 5),
  owner_mood integer NOT NULL CHECK (owner_mood BETWEEN 1 AND 5),
  topics jsonb NOT NULL DEFAULT '[]',
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  has_concern boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journey_responses_journey_idx
  ON journey_responses (journey_id, created_at DESC);

ALTER TABLE journey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_responses FORCE ROW LEVEL SECURITY;
-- Service writes; staff get own-shelter SELECT only (adopter-authored content).
DROP POLICY IF EXISTS journey_responses_select ON journey_responses;
CREATE POLICY journey_responses_select ON journey_responses FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM adoption_journeys j
        WHERE j.id = journey_responses.journey_id
          AND j.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  );
DROP POLICY IF EXISTS journey_responses_insert ON journey_responses;
CREATE POLICY journey_responses_insert ON journey_responses FOR INSERT
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS journey_responses_update ON journey_responses;
CREATE POLICY journey_responses_update ON journey_responses FOR UPDATE
  USING (current_setting('kithlink.role_class', true) = 'service')
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS journey_responses_delete ON journey_responses;
CREATE POLICY journey_responses_delete ON journey_responses FOR DELETE
  USING (current_setting('kithlink.role_class', true) = 'service');

CREATE TABLE IF NOT EXISTS adoption_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES adoption_journeys(id) ON DELETE CASCADE,
  -- Denormalized so RLS can gate purely on the shelter GUC.
  shelter_id uuid NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'concern' CHECK (kind IN ('concern','return')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution_note text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS adoption_cases_shelter_status_idx
  ON adoption_cases (shelter_id, status);
CREATE INDEX IF NOT EXISTS adoption_cases_journey_idx
  ON adoption_cases (journey_id);

ALTER TABLE adoption_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE adoption_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS adoption_cases_select ON adoption_cases;
CREATE POLICY adoption_cases_select ON adoption_cases FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND adoption_cases.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS adoption_cases_insert ON adoption_cases;
CREATE POLICY adoption_cases_insert ON adoption_cases FOR INSERT
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND adoption_cases.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS adoption_cases_update ON adoption_cases;
CREATE POLICY adoption_cases_update ON adoption_cases FOR UPDATE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND adoption_cases.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND adoption_cases.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS adoption_cases_delete ON adoption_cases;
CREATE POLICY adoption_cases_delete ON adoption_cases FOR DELETE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND adoption_cases.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
