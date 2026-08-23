-- m13: decision templates + task templates — M6/M10 completion.
-- Hand-idempotent: safe to re-run on every migrate.

CREATE TABLE IF NOT EXISTS decision_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shelter_id uuid NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decision_templates_shelter_idx
  ON decision_templates (shelter_id, created_at);

ALTER TABLE decision_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_templates FORCE ROW LEVEL SECURITY;
-- NULLIF guards the empty-string default of the shelter GUC: casting '' to uuid throws.
-- Manage role is enforced at ROUTE level (@RequireStaffRole('admin')); RLS grants
-- staff tenant select only — writes flow through service contexts.
DROP POLICY IF EXISTS decision_templates_select ON decision_templates;
CREATE POLICY decision_templates_select ON decision_templates FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND decision_templates.shelter_id
        = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
    )
  );
DROP POLICY IF EXISTS decision_templates_insert ON decision_templates;
CREATE POLICY decision_templates_insert ON decision_templates FOR INSERT
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS decision_templates_update ON decision_templates;
CREATE POLICY decision_templates_update ON decision_templates FOR UPDATE
  USING (current_setting('kithlink.role_class', true) = 'service')
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS decision_templates_delete ON decision_templates;
CREATE POLICY decision_templates_delete ON decision_templates FOR DELETE
  USING (current_setting('kithlink.role_class', true) = 'service');

-- Task templates: shelter_id NULL means platform default row (seeded below, read-only).
CREATE TABLE IF NOT EXISTS task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shelter_id uuid REFERENCES shelters(id) ON DELETE CASCADE,
  role staff_role NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 1000),
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_templates_shelter_idx
  ON task_templates (shelter_id, position);

-- Keeps re-seeding deterministic for platform rows across migrate re-runs.
CREATE UNIQUE INDEX IF NOT EXISTS task_templates_platform_role_title_idx
  ON task_templates (role, title)
  WHERE shelter_id IS NULL;

ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates FORCE ROW LEVEL SECURITY;
-- Staff see their own shelter's rows plus platform defaults; service sees everything.
DROP POLICY IF EXISTS task_templates_select ON task_templates;
CREATE POLICY task_templates_select ON task_templates FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR (
      current_setting('kithlink.role_class', true) = 'staff'
      AND (
        task_templates.shelter_id IS NULL
        OR task_templates.shelter_id
          = NULLIF(current_setting('kithlink.shelter_id', true), '')::uuid
      )
    )
  );
DROP POLICY IF EXISTS task_templates_insert ON task_templates;
CREATE POLICY task_templates_insert ON task_templates FOR INSERT
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS task_templates_update ON task_templates;
CREATE POLICY task_templates_update ON task_templates FOR UPDATE
  USING (current_setting('kithlink.role_class', true) = 'service')
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS task_templates_delete ON task_templates;
CREATE POLICY task_templates_delete ON task_templates FOR DELETE
  USING (current_setting('kithlink.role_class', true) = 'service');

-- Seed 6 platform-default onboarding tasks (guarded against duplicates).
select set_config('kithlink.role_class', 'service', true);
insert into task_templates (shelter_id, role, title, description, position)
select r.shelter_id, r.role::staff_role, r.title, r.description, r.position
from (values
  (null::uuid, 'viewer', 'Review new application inbox',
   'Read each newly submitted application and flag missing answers before review starts.', 0),
  (null::uuid, 'volunteer', 'Prep adoption folder',
   'Assemble the printed adoption packet: contract, care sheet, and microtransfer form.', 1),
  (null::uuid, 'coordinator', 'Schedule meet and greet',
   'Contact the applicant within 3 business days to book a meet and greet with the animal.', 2),
  (null::uuid, 'coordinator', 'Verify landlord consent',
   'For renters, collect written landlord approval before moving to the home check stage.', 3),
  (null::uuid, 'admin', 'Run home check',
   'Complete the standard home check walkthrough and record the outcome in the application.', 4),
  (null::uuid, 'owner', 'Finalize adoption contract',
   'Countersign the adoption contract and confirm fee collection with the coordinator.', 5)
) as r(shelter_id, role, title, description, position)
where not exists (
  select 1 from task_templates t
  where t.shelter_id is null
    and t.role = r.role::staff_role
    and t.title = r.title
)
on conflict do nothing;
