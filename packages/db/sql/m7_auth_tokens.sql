-- Auth recovery tokens (docs/design/11 §4 item 5): password reset + email verification.
-- Raw tokens are never stored; only sha256 hashes. This file is idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS password_reset_tokens_insert ON password_reset_tokens;
CREATE POLICY password_reset_tokens_insert ON password_reset_tokens FOR INSERT
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS password_reset_tokens_select ON password_reset_tokens;
CREATE POLICY password_reset_tokens_select ON password_reset_tokens FOR SELECT
  USING (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS password_reset_tokens_update ON password_reset_tokens;
CREATE POLICY password_reset_tokens_update ON password_reset_tokens FOR UPDATE
  USING (current_setting('kithlink.role_class', true) = 'service')
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');

ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verification_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_verification_tokens_insert ON email_verification_tokens;
CREATE POLICY email_verification_tokens_insert ON email_verification_tokens FOR INSERT
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS email_verification_tokens_select ON email_verification_tokens;
CREATE POLICY email_verification_tokens_select ON email_verification_tokens FOR SELECT
  USING (current_setting('kithlink.role_class', true) = 'service');
DROP POLICY IF EXISTS email_verification_tokens_update ON email_verification_tokens;
CREATE POLICY email_verification_tokens_update ON email_verification_tokens FOR UPDATE
  USING (current_setting('kithlink.role_class', true) = 'service')
  WITH CHECK (current_setting('kithlink.role_class', true) = 'service');
