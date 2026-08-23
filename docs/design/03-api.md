# 03 — API Specification

Base URL: `https://api.kithlink.org` · All JSON · OpenAPI 3.1 generated from Zod contracts (`packages/contracts`). Versioned by URL prefix: `/public/v1`, `/app/v1`, `/admin/v1`, `/internal/v1`.

## 1. Surface Map

| Prefix | Audience | Auth |
| --- | --- | --- |
| `/public/v1` | Anonymous web/3rd parties | none (CDN-cached 60 s) |
| `/app/v1` | Applicant PWA | session cookie |
| `/admin/v1` | Shelter dashboard | session cookie + staff role |
| `/internal/v1` | Workers → API, shelter server-to-server (API keys) | HMAC API key or mTLS |

## 2. Authentication & Sessions

- **Password auth:** Argon2id (m=64 MiB, t=3, p=4). Email verification via signed magic link (10 min TTL).
- **Sessions:** opaque 256-bit token in httpOnly `__Host-session` cookie; server-side session table with rotating refresh every 24 h; absolute expiry 30 d idle.
- **MFA:** TOTP optional for staff roles ≥ coordinator, mandatory for `owner` on managed cloud.
- **API keys (shelter S2S):** `kth_<shelterId>_<random>` — stored SHA-256-hashed; requests signed with `X-Kithlink-Key` + `X-Kithlink-Timestamp` + HMAC body digest; 5-min replay window.
- **OIDC federation** (shelter staff SSO w/ Google Workspace etc.) is v1.x: `users` gains `oidc_issuer`/`oidc_subject`; no schema break.

### 2.1 RBAC Matrix (staff roles)

| Capability | viewer | volunteer | coordinator | admin | owner |
| --- | - | - | - | - | - |
| View animals/applications | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create/edit animals, photos | | ✓ | ✓ | ✓ | ✓ |
| Move application status (triage) | | | ✓ | ✓ | ✓ |
| **Mark artifact verified/rejected** | | | ✓ | ✓ | ✓ |
| Edit CMS pages/publish site | | ✓ draft | ✓ | ✓ | ✓ |
| Manage sync targets / API keys | | | | ✓ | ✓ |
| Manage staff & roles | | | | ✓ | ✓ |
| Delete shelter, transfer ownership | | | | | ✓ |

Applicant-side authorization is ownership-based (`user_id` match) plus consent checks enforced twice: application guard + RLS policy (doc 02 §3).

## 3. Endpoint Catalog (representative)

### 3.1 Public registry

```
GET /public/v1/shelters?near=lat,lat&radius_km=25        # geo list
GET /public/v1/shelters/:slug                            # profile
GET /public/v1/shelters/:slug/animals?species=dog&size=large&cursor=…
GET /public/v1/shelters/:slug/animals/:id                # no applicant data ever
GET /public/v1/feed/shelters/:slug/rss.xml               # RSS export (doc 05 §4)
```

### 3.2 Applicant (`/app/v1`)

```
POST /me/profile                       PUT /me/profile
POST /me/artifacts                     # returns {artifact, upload:{url,fields,expiresIn}}
                                       # presigned S3 POST policy; client uploads direct
POST /me/artifacts/:id/upload-complete # API HEADs object, verifies sha+mime, enqueues parse job
GET  /me/artifacts                     # list w/ state, confidence, verifications summary
POST /me/artifacts/:id/share           # (rare) manual grant outside an application
DELETE /me/consents/:grantId           # revoke → immediate RLS cutoff + file-deletion scheduler
GET  /me/applications                  POST /applications   # body: animal_id, answers{}
POST /applications/:id/withdraw
GET  /me/consents                      # visibility dashboard ("who can see what")
```

**POST /applications** — the "≤3 clicks" flow:

```jsonc
// Request (profile + artifacts are attached automatically from the reusable profile)
{ "animal_id": "0197…", "answers": { "why_this_pet": "…", "surrender_plan": "…" } }
// 201 Created
{
  "application": { "id": "…", "status": "submitted" },
  "consent_grant": { "id": "…", "scope": "application_review", "expires_at": "2026-11-20T00:00:00Z" },
  "shared_artifacts": [ { "id": "…", "type": "lease_addendum",
      "network_verified": true,
      "verifications": [ { "shelter": "happytail", "outcome": "confirmed", "at": "2026-05-01T…"} ] } ]
}
```

### 3.3 Shelter admin (`/admin/v1`)

```
CRUD /admin/animals[/:id]              POST /admin/animals/:id/photos (presign flow)
GET  /admin/applications?status=in_review
POST /admin/applications/:id/status    # state machine validated server-side
GET  /admin/artifacts?applicant=:id    # only permitted while consent active (403 otherwise)
GET  /admin/artifacts/:id/file         # short-TTL presigned GET; audit-logged
POST /admin/artifacts/:id/verifications
GET  /admin/audit-logs?actor=&entity=
PUT  /admin/settings/sync-targets/:provider
POST /admin/sites/publish
```

**POST …/verifications** example:

```json
{ "method": "landlord_call", "outcome": "confirmed",
  "notes_redacted": "Confirmed pet policy allows 2 cats; deposit $300.",
  "call_log_url": null, "valid_until": "2027-08-01T00:00:00Z" }
```

Side effects: artifact re-scored → possibly `verified`; if first external confirmation → `network_verified=true` → notify applicant + prior shelters' subscribers (webhooks).

## 4. Webhooks (outbound)

Shelters and integrators subscribe per event class. Delivery: at-least-once, exponential backoff ×12 over 24 h, HMAC-SHA256 signature header `X-Kithlink-Signature: t=<ts>,v1=<hmac>` over `ts.body`.

Event classes: `animal.updated`, `application.status_changed`, `artifact.network_verified`, `site.published`, `sync.run_failed`.

## 5. Errors, Idempotency, Limits

```jsonc
// RFC 9457 problem+json everywhere
{ "type": "https://docs.kithlink.org/errors/consent-required",
  "title": "No active consent for this applicant",
  "status": 403, "detail": "Consent expired 2026-06-01.", "instance": "/admin/v1/artifacts/…" }
```

| Rule | Value |
| --- | --- |
| Idempotency | `Idempotency-Key` required on POST /applications, animal bulk upserts, webhook retries; keys cached 24 h |
| Rate limits (default) | anon 60/min/IP · authed 300/min · presign endpoints 20/min/user · auth login 10/min/IP + lockout backoff |
| Pagination | cursor-based (`?cursor=`,`limit`≤100); responses carry `next_cursor` |
| Versioning | additive changes within `/vN`; breaking → new prefix, 12-mo deprecation overlap |

## 6. Consent Enforcement Points (defense in depth)

1. Route guard: staff endpoint touching artifacts resolves active `consent_grant` or 403.
2. Service layer: re-checks grant inside the same transaction that issues any presigned URL.
3. Database: RLS policy filters rows regardless of app bugs (doc 02 §3).
4. Storage: object keys are unguessable UUIDv7 paths; bucket policy denies public access; presigned URLs max TTL 120 s for artifacts (10 min for animal photos).
