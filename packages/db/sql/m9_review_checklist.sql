-- m9: objective review checklist + placement velocity — M6 anti-bias quick win
-- (docs/design/12-pain-points-milestones.md §M6).
-- Hand-idempotent: safe to re-run on every migrate.

CREATE TABLE IF NOT EXISTS review_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shelter_id uuid NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_checklist_items_shelter_idx
  ON review_checklist_items (shelter_id, position);

ALTER TABLE review_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_checklist_items FORCE ROW LEVEL SECURITY;
-- NULLIF guards the empty-string default of the shelter GUC: casting '' to uuid throws.
DROP POLICY IF EXISTS review_checklist_items_select ON review_checklist_items;
CREATE POLICY review_checklist_items_select ON review_checklist_items FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND review_checklist_items.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS review_checklist_items_insert ON review_checklist_items;
CREATE POLICY review_checklist_items_insert ON review_checklist_items FOR INSERT
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND review_checklist_items.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS review_checklist_items_update ON review_checklist_items;
CREATE POLICY review_checklist_items_update ON review_checklist_items FOR UPDATE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND review_checklist_items.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND review_checklist_items.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS review_checklist_items_delete ON review_checklist_items;
CREATE POLICY review_checklist_items_delete ON review_checklist_items FOR DELETE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND review_checklist_items.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );

-- Per-application checkbox state; staff visibility derives from the application's shelter.
CREATE TABLE IF NOT EXISTS application_checklist_state (
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES review_checklist_items(id) ON DELETE CASCADE,
  checked bool NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, item_id)
);

CREATE INDEX IF NOT EXISTS application_checklist_state_item_idx
  ON application_checklist_state (item_id);

ALTER TABLE application_checklist_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_checklist_state FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS application_checklist_state_select ON application_checklist_state;
CREATE POLICY application_checklist_state_select ON application_checklist_state FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM applications ap
        WHERE ap.id = application_checklist_state.application_id
          AND ap.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  );
DROP POLICY IF EXISTS application_checklist_state_insert ON application_checklist_state;
CREATE POLICY application_checklist_state_insert ON application_checklist_state FOR INSERT
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM applications ap
        WHERE ap.id = application_checklist_state.application_id
          AND ap.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  );
DROP POLICY IF EXISTS application_checklist_state_update ON application_checklist_state;
CREATE POLICY application_checklist_state_update ON application_checklist_state FOR UPDATE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM applications ap
        WHERE ap.id = application_checklist_state.application_id
          AND ap.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  )
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM applications ap
        WHERE ap.id = application_checklist_state.application_id
          AND ap.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  );
DROP POLICY IF EXISTS application_checklist_state_delete ON application_checklist_state;
CREATE POLICY application_checklist_state_delete ON application_checklist_state FOR DELETE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND EXISTS (
        SELECT 1 FROM applications ap
        WHERE ap.id = application_checklist_state.application_id
          AND ap.shelter_id = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  );
