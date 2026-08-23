-- m6: application_notes — internal staff notes on adoption applications
-- (docs/design/11-feature-gap-analysis.md §4 item 4).
-- Hand-idempotent: safe to re-run on every migrate.

CREATE TABLE IF NOT EXISTS application_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  -- Denormalized so RLS can gate purely on the shelter GUC.
  shelter_id uuid NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_notes_application_idx
  ON application_notes (application_id, created_at ASC);

ALTER TABLE application_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_notes FORCE ROW LEVEL SECURITY;
-- NULLIF guards the empty-string default of the shelter GUC: casting '' to uuid throws.
DROP POLICY IF EXISTS application_notes_insert ON application_notes;
CREATE POLICY application_notes_insert ON application_notes FOR INSERT
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND application_notes.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS application_notes_select ON application_notes;
CREATE POLICY application_notes_select ON application_notes FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND application_notes.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
-- No update/delete policies: notes are append-only.
