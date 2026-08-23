-- m15: animal photo upload pipeline (docs/design/12 §M14).
-- sha256 is captured at upload-complete verification time; rows created by
-- presign start pending with bytes/sha256 NULL. Hand-idempotent.

ALTER TABLE animal_photos ADD COLUMN IF NOT EXISTS sha256 text;
