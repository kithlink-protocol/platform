-- m18/m20: post-adoption checklist + ethical nudge bookkeeping
-- (docs/design/12 §M5 extension).
-- Hand-idempotent: safe to re-run on every migrate.

ALTER TABLE favorite_animals ADD COLUMN IF NOT EXISTS last_nudged_at timestamptz;
ALTER TABLE adoption_journeys ADD COLUMN IF NOT EXISTS checklist_items jsonb NOT NULL DEFAULT '[]';

ALTER TABLE users ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';
