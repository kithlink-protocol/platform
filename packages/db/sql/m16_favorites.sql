-- m16: favorite_animals — saved pets per adopter (docs/design/12 §M16).
-- Availability alerts ride the outbox when a favorited animal becomes available again.
-- Hand-idempotent: safe to re-run on every migrate.

CREATE TABLE IF NOT EXISTS favorite_animals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  animal_id uuid NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorite_animals_user_animal_key UNIQUE (user_id, animal_id)
);

CREATE INDEX IF NOT EXISTS favorite_animals_user_idx
  ON favorite_animals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS favorite_animals_animal_idx
  ON favorite_animals (animal_id);

ALTER TABLE favorite_animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_animals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS favorite_animals_self_select ON favorite_animals;
CREATE POLICY favorite_animals_self_select ON favorite_animals FOR SELECT
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.user_id', true) = user_id::text
  );

DROP POLICY IF EXISTS favorite_animals_self_insert ON favorite_animals;
CREATE POLICY favorite_animals_self_insert ON favorite_animals FOR INSERT
  WITH CHECK (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.user_id', true) = user_id::text
  );

DROP POLICY IF EXISTS favorite_animals_self_delete ON favorite_animals;
CREATE POLICY favorite_animals_self_delete ON favorite_animals FOR DELETE
  USING (
    current_setting('kithlink.role_class', true) = 'service'
    OR current_setting('kithlink.user_id', true) = user_id::text
  );
-- No update policy: favorites are add/remove only.
