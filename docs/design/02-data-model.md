# 02 — Data Model

## 1. ERD (core entities)

```mermaid
erDiagram
    SHELTER ||--o{ STAFF_MEMBER : employs
    USER ||--o{ STAFF_MEMBER : "is"
    USER ||--o| APPLICANT_PROFILE : has
    SHELTER ||--o{ ANIMAL : lists
    ANIMAL ||--o{ ANIMAL_PHOTO : has
    APPLICANT_PROFILE ||--o{ ARTIFACT : owns
    ARTIFACT ||--o{ ARTIFACT_FILE : "versions of"
    ARTIFACT ||--o{ VERIFICATION : receives
    VERIFICATION }o--|| STAFF_MEMBER : "performed by"
    APPLICANT_PROFILE ||--o{ APPLICATION : submits
    APPLICATION }o--|| ANIMAL : targets
    APPLICATION }o--|| SHELTER : "sent to"
    APPLICATION }o-o{ CONSENT_GRANT : activates
    CONSENT_GRANT }o--|| SHELTER : scopes
    SHELTER ||--o{ SYNC_TARGET : configures
    SYNC_TARGET ||--o{ SYNC_RUN : logs
    SHELTER ||--o| SITE : publishes
```

## 2. PostgreSQL DDL (authoritative subset)

Conventions: UUIDv7 PKs (`uuidv7` for index locality), `timestamptz`, soft-delete only where noted, all tenant tables carry `shelter_id`.

```sql
CREATE TYPE staff_role AS ENUM ('owner','admin','coordinator','volunteer','viewer');
CREATE TYPE application_status AS ENUM ('draft','submitted','in_review','info_requested',
  'approved','denied','withdrawn','adopted','expired');
CREATE TYPE artifact_type AS ENUM ('lease_addendum','vet_record','gov_id','utility_bill','other');
CREATE TYPE artifact_state AS ENUM ('uploaded','parsing','parsed','pending_review',
  'verified','rejected','expired');
CREATE TYPE verification_outcome AS ENUM ('confirmed','failed_contact','discrepancy','revoked');
CREATE TYPE consent_scope AS ENUM ('application_review','post_adoption_contact');
CREATE TYPE consent_status AS ENUM ('granted','active','revoked','expired');

CREATE TABLE shelters (
  id            uuid PRIMARY KEY,
  slug          text UNIQUE NOT NULL,          -- subdomain + URL key
  name          text NOT NULL,
  settings      jsonb NOT NULL DEFAULT '{}',   -- timezone, contact, brand tokens
  plan          text NOT NULL DEFAULT 'community',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             uuid PRIMARY KEY,
  email          citext UNIQUE NOT NULL,
  password_hash  text,                          -- null until first password set (magic-link onboarding)
  totp_secret_enc bytea,
  email_verified_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz                    -- GDPR erasure tombstone
);

CREATE TABLE staff_members (
  shelter_id  uuid NOT NULL REFERENCES shelters(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  role        staff_role NOT NULL DEFAULT 'volunteer',
  PRIMARY KEY (shelter_id, user_id)
);

CREATE TABLE applicant_profiles (
  id            uuid PRIMARY KEY,
  user_id       uuid UNIQUE NOT NULL REFERENCES users(id),
  legal_name    text NOT NULL,
  display_name  text,
  phone         text,
  address_enc   bytea NOT NULL,                -- AES-256-GCM sealed box (doc 04 §6)
  household_json jsonb NOT NULL DEFAULT '{}',  -- adults, children ages, other pets (non-sensitive)
  lifestyle_json jsonb NOT NULL DEFAULT '{}', -- hours alone, yard, experience
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE animals (
  id           uuid PRIMARY KEY,
  shelter_id   uuid NOT NULL REFERENCES shelters(id),
  name         text NOT NULL,
  species      text NOT NULL CHECK (species IN ('dog','cat','other')),
  breed        text,
  birth_year   int,
  sex          text CHECK (sex IN ('male','female','unknown')),
  size         text CHECK (size IN ('small','medium','large','xl')),
  status       text NOT NULL DEFAULT 'available'
               CHECK (status IN ('draft','available','pending','adopted','unavailable')),
  description  text,
  medical_json jsonb NOT NULL DEFAULT '{}',   -- vaccinations timeline, spay/neuter, microchip
  traits_json  jsonb NOT NULL DEFAULT '{}',   -- good_with_kids, good_with_dogs, energy…
  external_refs jsonb NOT NULL DEFAULT '{}',  -- {"petfinder":"…","adoptapet":"…"}
  fts          tsvector GENERATED ALWAYS AS (to_tsvector('english',
                 coalesce(name,'') || ' ' || coalesce(breed,'') || ' ' || coalesce(description,''))) STORED
);
CREATE INDEX animals_shelter_idx ON animals(shelter_id, status);
CREATE INDEX animals_fts_idx ON animals USING gin(fts);

CREATE TABLE animal_photos (
  id         uuid PRIMARY KEY,
  animal_id  uuid NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  position   int NOT NULL DEFAULT 0,
  alt_text   text                              -- a11y requirement
);

CREATE TABLE artifacts (
  id              uuid PRIMARY KEY,
  applicant_id    uuid NOT NULL REFERENCES applicant_profiles(id),
  type            artifact_type NOT NULL,
  state           artifact_state NOT NULL DEFAULT 'uploaded',
  extracted_json  jsonb,                       -- LLM output (redacted per doc 04 §5)
  confidence      numeric(4,3),                -- 0..1 pipeline confidence score
  redacted_text   text,                        -- minimized text retained for re-parse audits
  expires_at      timestamptz,                 -- lease end / vaccine validity
  network_verified boolean NOT NULL DEFAULT false,  -- ≥1 external shelter confirmed
  created_at      timestamptz NOT NULL DEFAULT now(),
  superseded_by   uuid REFERENCES artifacts(id)
);
CREATE INDEX artifacts_applicant_idx ON artifacts(applicant_id, type, state);

CREATE TABLE artifact_files (
  id           uuid PRIMARY KEY,
  artifact_id  uuid NOT NULL REFERENCES artifacts(id),
  version      int NOT NULL DEFAULT 1,
  storage_key  text UNIQUE NOT NULL,           -- ciphertext object
  edek_wrapped bytea NOT NULL,                 -- envelope-encrypted data key (doc 04 §6)
  sha256       bytea NOT NULL,
  mime         text NOT NULL,
  bytes        bigint NOT NULL,
  uploaded_by  uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE verifications (
  id           uuid PRIMARY KEY,
  artifact_id  uuid NOT NULL REFERENCES artifacts(id),
  shelter_id   uuid NOT NULL REFERENCES shelters(id),
  performed_by uuid REFERENCES users(id),      -- null if automated (clinic API)
  method       text NOT NULL CHECK (method IN ('landlord_call','clinic_api','document_audit','automated')),
  outcome      verification_outcome NOT NULL,
  notes_redacted text,
  call_log_url text,                           -- optional recording/transcript link (encrypted bucket ref)
  verified_at  timestamptz NOT NULL DEFAULT now(),
  valid_until  timestamptz
);
CREATE INDEX verifications_artifact_idx ON verifications(artifact_id, outcome);

CREATE TABLE applications (
  id            uuid PRIMARY KEY,
  animal_id     uuid NOT NULL REFERENCES animals(id),
  shelter_id    uuid NOT NULL REFERENCES animals(shelter_id),  -- denormalized, enforced by trigger
  applicant_id  uuid NOT NULL REFERENCES applicant_profiles(id),
  status        application_status NOT NULL DEFAULT 'submitted',
  answers_json  jsonb NOT NULL DEFAULT '{}',   -- shelter-specific questionnaire
  submitted_at  timestamptz,
  decided_at    timestamptz,
  decision_note_enc bytea,                     -- visible to applicant only if shelter opts in
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (animal_id, applicant_id)
);
CREATE INDEX applications_shelter_idx ON applications(shelter_id, status, submitted_at);

CREATE TABLE consent_grants (
  id            uuid PRIMARY KEY,
  applicant_id  uuid NOT NULL REFERENCES applicant_profiles(id),
  shelter_id    uuid NOT NULL REFERENCES shelters(id),
  application_id uuid REFERENCES applications(id),
  scope         consent_scope NOT NULL,
  status        consent_status NOT NULL DEFAULT 'granted',
  granted_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  expires_at    timestamptz                    -- default: application close + 90d (configurable)
);
CREATE INDEX consents_lookup_idx ON consent_grants(applicant_id, shelter_id, scope, status);
```

Supporting tables (same patterns): `sites`, `site_pages`, `custom_domains`, `sync_targets`, `sync_runs`, `api_keys`, `outbox_events`, `webhook_endpoints`, `webhook_deliveries`, `audit_logs`, `idempotency_keys`. Full DDL ships in `packages/db/migrations`.

## 3. Multi-Tenancy: RLS as the Backstop

Application code scopes every query by `shelter_id`, **and** Postgres enforces it. Every request transaction executes:

```sql
SET LOCAL kithlink.user_id = '<uuid>';
SET LOCAL kithlink.shelter_id = '<uuid or NULL>';
SET LOCAL kithlink.role_class = 'staff' | 'applicant' | 'service';
```

Representative policies:

```sql
ALTER TABLE animals ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_rw ON animals FOR ALL TO app_user
  USING (current_setting('kithlink.shelter_id') = shelter_id::text)
  WITH CHECK (current_setting('kithlink.shelter_id') = shelter_id::text);

ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
-- Applicants see their own; staff see an applicant's artifacts ONLY while an
-- active consent grant exists for their shelter:
CREATE POLICY artifact_access ON artifacts FOR SELECT TO app_user
  USING (
    current_setting('kithlink.user_id') IN
      (SELECT user_id::text FROM applicant_profiles WHERE id = artifacts.applicant_id)
    OR EXISTS (
      SELECT 1 FROM consent_grants cg
      WHERE cg.applicant_id = artifacts.applicant_id
        AND cg.shelter_id = current_setting('kithlink.shelter_id')::uuid
        AND cg.status = 'active'
        AND now() < COALESCE(cg.revoked_at, cg.expires_at, 'infinity'))
  );
```

Rules:

- Workers connect with a non-RLS service role but must set the same GUCs for audit consistency.
- Migration CI test asserts **every** table containing PII has RLS enabled (fails build otherwise).
- Applicant-owned tables use the same pattern keyed by `user_id` instead of `shelter_id`.

## 4. Entity State Machines

### 4.1 Application

```
draft → submitted → in_review → info_requested ⇄ in_review
                                in_review → approved → adopted
                                in_review → denied
any(pre-approved) → withdrawn
submitted/in_review → expired (auto after N days, configurable per shelter)
```

Transitions emit domain events (`application.submitted`, …) consumed by: notification dispatcher, webhook dispatcher, and — critically — **consent lifecycle manager**:

| Event | Consent effect |
| --- | --- |
| `application.submitted` | Create `consent_grant(application_review)` → status `active` |
| `application.adopted/denied/withdrawn/expired` | Schedule grant → `expired` at `now() + retention_window` (default 90 d); post-adoption scope requires separate explicit opt-in |

### 4.2 Artifact

```
uploaded → parsing → parsed ──► pending_review ──► verified ──► expired (expires_at passed)
                        └► failed_parse → pending_review (manual entry fallback)
verified/rejected → superseded (new file version uploaded)
```

`network_verified` flips true when any verification row from a shelter other than the uploader-linked one has `outcome='confirmed'` and is unexpired.

## 5. Retention & Erasure

| Data | Retention |
| --- | --- |
| Raw artifact files | Deleted 30 d after last active consent ends (configurable); metadata tombstone kept |
| Application records | Kept 24 mo for shelter reporting, then anonymize applicant FK |
| Audit logs | 7 y append-only (legal defense), contains **no document contents**, only references |
| User account deletion | Crypto-shredding: destroy user KEK → all sealed fields unrecoverable; PII columns nulled |
