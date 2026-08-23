-- m10: animal_observations — longitudinal behavior timeline (docs/design/12 §M7).
-- Append-only snapshots of a single animal's stress/behavior; never a verdict.
-- Hand-idempotent: safe to re-run on every migrate.

CREATE TABLE IF NOT EXISTS animal_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  -- Denormalized so RLS can gate purely on the shelter GUC.
  shelter_id uuid NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  fas_score int CHECK (fas_score BETWEEN 0 AND 4),
  tags text[] NOT NULL DEFAULT '{}',
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000),
  author_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT animal_observations_content_check
    CHECK (fas_score IS NOT NULL OR char_length(note) >= 1)
);

CREATE INDEX IF NOT EXISTS animal_observations_animal_idx
  ON animal_observations (animal_id, created_at DESC);

ALTER TABLE animal_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE animal_observations FORCE ROW LEVEL SECURITY;
-- NULLIF guards the empty-string default of the shelter GUC: casting '' to uuid throws.
DROP POLICY IF EXISTS animal_observations_select ON animal_observations;
CREATE POLICY animal_observations_select ON animal_observations FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
    OR (
      current_setting('kithlink.role_class', true) = 'anonymous'
      AND EXISTS (
        SELECT 1 FROM animals a
        WHERE a.id = animal_id AND a.status = 'available'
      )
    )
  );
DROP POLICY IF EXISTS animal_observations_insert ON animal_observations;
CREATE POLICY animal_observations_insert ON animal_observations FOR INSERT
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
-- No update/delete policies: observations are append-only snapshots.
