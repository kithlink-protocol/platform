-- m12: sterilization compliance tracker (docs/design/12 §M9).
-- Status/due date/voucher reference per animal; reminder sweep rides the outbox.
-- Hand-idempotent: safe to re-run on every migrate.

ALTER TABLE animals ADD COLUMN IF NOT EXISTS sterilization_status text NOT NULL DEFAULT 'unknown';
ALTER TABLE animals ADD COLUMN IF NOT EXISTS sterilization_due_date timestamptz;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS sterilization_voucher_ref text;

DO $$
BEGIN
  ALTER TABLE animals DROP CONSTRAINT IF EXISTS animals_sterilization_status_check;
  ALTER TABLE animals ADD CONSTRAINT animals_sterilization_status_check
    CHECK (sterilization_status IN ('unknown','scheduled','completed','voucher_issued'));
END $$;

CREATE INDEX IF NOT EXISTS animals_sterilization_sweep_idx
  ON animals (shelter_id, sterilization_status, sterilization_due_date)
  WHERE status = 'available';

-- One-time backfill from the legacy medical_json.spayNeuter flag; the guarded WHERE
-- makes re-runs no-ops once a row has any explicit status.
UPDATE animals
SET sterilization_status = 'completed'
WHERE sterilization_status = 'unknown'
  AND medical_json->>'spayNeuter' IN ('true', 'yes');
