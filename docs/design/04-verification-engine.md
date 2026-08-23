# 04 — Verification Engine

The engine turns unstructured documents (photos of leases, vet records, ID) into **structured, confidence-scored, redacted artifacts** and coordinates human verification — without ever making adoption judgments.

## 1. Pipeline Overview

```
upload → [V1 Ingest] → [V2 OCR] → [V3 Extract (LLM)] → [V4 Score & Redact] 
       → [V5 Route: auto-accept | audit queue | manual fallback] → artifact.state
```

Executed by `worker-verify` consuming BullMQ queue `verify.parse` (concurrency 4/replica, job TTL 10 min).

## 2. Stage Specs

### V1 — Ingest & Validate
- Triggered by `/me/artifacts/:id/upload-complete`.
- API HEADs the object; asserts sha256 match, MIME allow-list (`pdf,png,jpg,webp,heic`), size ≤ 25 MB.
- HEIC→JPEG transcode via `sharp`; PDFs rasterized page-wise at 300 dpi.
- Virus scan hook (ClamAV container in compose/helm; no-op adapter if absent).
- Sets `state=parsing`, emits job with `{artifactId, fileKey}` only — **bytes never transit the API**.

### V2 — OCR
- Default: Tesseract (eng) in-process; per-page text + word bounding boxes.
- Adapter interface `OcrProvider { ocr(buf): Page[] }` — cloud OCR (Google Document AI / AWS Textract) pluggable for managed cloud or quality-sensitive self-hosters.

### V3 — LLM Extraction
- Input: OCR text **after deterministic pre-redaction** (see §5).
- Provider: OpenAI-compatible chat endpoint via `LlmProvider` adapter. Structured output enforced by JSON-schema-constrained decoding; result validated against Zod contract; invalid → one repair retry → else `failed_parse`.
- Per-type target schemas:

```jsonc
// lease_addendum
{ "landlord_name": "…", "landlord_phone_e164": "+1…", "property_address": "…",
  "pet_policy": { "allowed": true, "species_limits": ["cat"], "max_count": 2,
                  "deposit_usd": 300, "notes": "…" },
  "lease_start": "2026-01-01", "lease_end": "2026-12-31",
  "tenant_names": ["…"], "document_type_guess": "lease_addendum" }

// vet_record
{ "clinic_name":"…","clinic_phone_e164":"+1…","issued_on":"2026-04-02",
  "patient_name":"…","visits":[{"date":"2026-04-02","items":["rabies 3yr"]}],
  "vaccinations":[{"type":"rabies","date":"2026-04-02","valid_until":"2029-04-02"}],
  "spay_neuter":true,"microchip_id":"985…"}
```

- Hallucination guards: every extracted phone/date/address must appear (fuzzy ≥0.85 normalized) in source OCR text; otherwise field is nulled and flagged `ungrounded`.

### V4 — Confidence Scoring
Weighted feature score → `confidence ∈ [0,1]`:

| Feature | Weight |
| --- | --- |
| Mean OCR token confidence | 0.20 |
| % fields grounded in source text | 0.30 |
| Schema completeness (required fields non-null) | 0.25 |
| Cross-field consistency (dates ordered, phone valid E.164, checksum-valid microchip) | 0.15 |
| Document-type classifier agreement (fast on-device classifier vs. guess) | 0.10 |

### V5 — Routing

| Confidence | Destination |
| --- | --- |
| ≥ 0.90 | `parsed`, auto-surface to reviewing shelter as *draft* data (still needs human verify before `verified`) |
| 0.55 – 0.90 | `pending_review` — staff sees side-by-side: original image ↔ extracted fields, edit-and-confirm UI |
| < 0.55 or failed_parse | Manual-entry form prefilled with whatever parsed; artifact usable without any extraction |

**No artifact reaches `verified` without a human `verifications` row (or clinic-API callback).** Extraction never auto-verifies.

## 3. Verification Workflows

### 3.1 Landlord phone verification (first-pass)
1. Coordinator opens application → artifact panel shows extracted landlord phone (click-to-call), pet policy summary, lease dates.
2. After call, coordinator records outcome via `POST /admin/artifacts/:id/verifications` (`confirmed | failed_contact | discrepancy`) with optional call-log attachment (encrypted).
3. Outcome writes `verifications` row; artifact may flip to `verified`; audit log entry.

### 3.2 Network reuse (Shelter B)
When applicant applies to Shelter B:

```
Application submitted ──► consent grant active ──► Shelter B dashboard renders:
  ├─ artifact card: state=verified, network_verified=true
  ├─ verifications timeline (Shelter A confirmed landlord 2026-05-01, notes_redacted)
  ├─ actions: "Accept prior verification" | "Re-verify" | "Request update"
  └─ accept → writes new verification row {method:'prior_verification', outcome:'confirmed',
             performed_by:<coordinator>}  ← explicit human act, keeps liability with each shelter
```

### 3.3 Vet clinic API (roadmap v1.x)
Adapter interface `ClinicDirectoryProvider` for e.g. VetData/Animals-only-partners: fetch record by microchip ID + owner consent code → automated `verification(method='clinic_api')`. Design now, ship later; schema already supports it.

## 4. Expiry & Refresh

- `expires_at = min(artifact-level expiry)` — lease end date, vaccine validity, or policy default (gov_id 24 mo, vet_record 12 mo).
- Nightly cron marks `expired`; applicants get email 30 d prior with one-tap re-upload (new `artifact_files` version, old file retained until consent window closes).
- Expired artifacts drop out of network surfacing but keep tombstone metadata for audit.

## 5. PII Minimization for LLM Calls

Deterministic pre-redaction pass over OCR text **before any third-party call**:

| Original | Replaced with |
| --- | --- |
| SSN patterns, DOB beyond year | `[REDACTED_SSN]`, birth year only |
| Bank/CC numbers (Luhn-valid sequences) | `[REDACTED_FIN]` |
| Applicant's own signature block | `[SIGNATURE]` |

Retained because they're operationally required: names, phones, addresses (these are the point of verification). Managed-cloud default provider is configured with zero-retention/no-training terms; self-hosters pointing at arbitrary endpoints see a first-run disclosure banner requiring acknowledgment. Raw files are **never** sent to the LLM — only redacted OCR text.

## 6. Encryption Envelope

Per-artifact-file envelope encryption:

```
DEK (256-bit, ephemeral) ──AES-256-GCM──► ciphertext object in S3
KEK (per-user master key, derived HKDF-SHA256 from random 32B stored encrypted
     under platform KMS key or env-provided key for self-host)
edek_wrapped = AES-GCM(KEK, DEK)            # stored in artifact_files row
```

- Presigned GETs are issued only after: session auth → consent check (guard + service + RLS) → KEK unwrap of DEK in API process → presign. (Objects are encrypted client-side-of-S3; S3 SSE adds a second layer where supported.)
- **Crypto-shredding:** deleting a user destroys their KEK; all sealed address fields and edeks become permanently unreadable even from backups.
- Key rotation: re-wrap edeks lazily on access; object ciphertext untouched.

## 7. Failure Modes

| Failure | Behavior |
| --- | --- |
| LLM endpoint down/timeout (30 s) | Job retries ×5 backoff → then `pending_review` w/ empty extraction (manual path always available) |
| OCR garbage (scanned handwriting) | Low confidence → manual entry; telemetry tag `ocr_quality=poor` |
| Duplicate upload (same sha256 per user+type) | Deduped: returns existing artifact, bumps `last_seen_at` |
| Malicious polyglot file | ClamAV + MIME sniff + rasterize-before-parse; LLM never executes anything, only reads text |
