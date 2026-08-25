# Implementation Status

What is actually built today, verified against the code (last reviewed:
v1.0.0-rc.1). Status: **Shipped** = in the product; **Beta** = works but
incomplete/needs operator care; **Planned** = not yet implemented
([roadmap](design/09-roadmap.md)).

| Capability | Status | Where (code path) | Docs |
| --- | --- | --- | --- |
| Auth + sessions (email/password, 30-day cookie) | Shipped | `apps/server/src/modules/auth/` | [Applicant Guide](guide/applicants.md#create-an-account) |
| RBAC (viewer→owner) + Postgres RLS | Shipped | `apps/server/src/modules/staff/`, `packages/db/` RLS policies | [03 API & RBAC](design/03-api.md), [Staff roles](guide/shelter-admin.md#staff-roles) |
| Animals CRUD + photos | Shipped (API only — no UI editor) | `apps/server/src/modules/animals/` | [Animals](guide/shelter-staff.md#animals-and-their-statuses) |
| Public registry (shelters/animals) | Shipped | `apps/server/src/modules/public/public.controller.ts` | [02 Data model](design/02-data-model.md) |
| Applications pipeline + status machine | Shipped | `apps/server/src/modules/applications/` | [Reviewing applications](guide/shelter-staff.md#reviewing-applications) |
| Consent grants + revocation | Shipped (API); consents UI page Planned | `apps/server/src/modules/consents/` (`GET/DELETE /app/v1/me/consents`) | [Manage consents](guide/applicants.md#manage-consents) |
| Artifact upload + envelope encryption (AES-256-GCM) | Shipped | `apps/server/src/modules/artifacts/`, `modules/s3/`; key: `KITHLINK_MASTER_KEY` | [Upload documents](guide/applicants.md#upload-verification-documents) |
| OCR/LLM parse skeleton w/ manual fallback | Beta — LLM stage off unless operator sets `LLM_BASE_URL` | `apps/server/src/modules/parse/` | [04 Verification engine](design/04-verification-engine.md) |
| Verification network + accept-prior-verification | Shipped | `apps/server/src/modules/verifications/` | [Verifying artifacts](guide/shelter-staff.md#verifying-applicant-artifacts) |
| One-click site setup ("Launch your shelter site") | Shipped | `POST …/site/setup` in `modules/sites/sites.controller.ts`; admin `/site` (`data-testid="setup-cta"` / `"setup-done"`) | [Launch](guide/shelter-admin.md#building-your-public-website-site) |
| Subdomain serving `<slug>.<SITES_ROOT_DOMAIN>` | Shipped | `apps/web/middleware.ts` → `GET /public/v1/sites/resolve` → `/site-view/<slug>` | [Subdomains](deploy/overview.md#shelter-sites-subdomains--custom-domains) |
| Custom domains (claim → DNS TXT verify) | Beta | `modules/sites/sites.service.ts`; admin `/site` domains card | [Custom domains](guide/shelter-admin.md#custom-domains-beta) |
| RSS export | Shipped | `GET /public/v1/feed/shelters/:slug/rss.xml` in `modules/sites/public-sites.controller.ts` | [RSS feed](guide/shelter-admin.md#rss-feed) |
| Petfinder sync adapter (dry-run/live) | Shipped | `apps/server/src/modules/sync/` | [Syndication](guide/shelter-admin.md#syndication-sync) |
| Adopt-a-Pet adapter | Beta — API-level adapter; not in the UI dropdown yet | `apps/server/src/modules/sync/` | [Roadmap backlog](design/09-roadmap.md) |
| Rate limiting (in-memory) | Shipped | `apps/server/src/common/rate-limit.middleware.ts` (`RATE_LIMIT_OFF=1` disables) | [429s](guide/troubleshooting.md#http-429-rate-limit-errors) |
| Version endpoint | Shipped | `GET /public/v1/version` (+ `/healthz`, `/readyz`) in `public.controller.ts` | [Verify health](deploy/overview.md#9-verify-health) |
| CI e2e (Playwright journeys) | Shipped | `.github/workflows/ci.yml`; specs in `apps/e2e/tests/` | [Verified install](deploy/overview.md#verified-install) |
| Load script | Beta — `scripts/load/smoke.js`, run manually; k6-in-CI Planned | `scripts/load/smoke.js` | [08 Deployment & ops](design/08-deployment-ops.md) |
| Self-host Compose stack | Shipped | `deploy/compose/` | [Deployment Guide](deploy/overview.md) |

Planned (no code path yet): dedicated consents UI page · animal create/edit UI
forms · staff-management UI · Adopt-a-Pet in the sync dropdown · magic-link
email verification · TOTP UI · clinic-API verifications · Petfinder inbound
inquiries · LLM extraction on by default · i18n · managed-cloud Helm polish ·
k6 in CI · Geist font swap. See the [remaining backlog](design/09-roadmap.md).

## P0 basics batch (2026-08-23)

| Capability | Status | Where |
| --- | --- | --- |
| Network-wide animal search w/ filters (species/sex/size/ageClass/q/shelter) | Shipped | `apps/server/src/modules/animals/service.search` · web `/animals` |
| Location + radius search | Shipped (lat/lng + haversine) | shelters geo columns · `/animals?nearLat&nearLng&radiusKm` |
| Animal detail pages | Shipped | web `/animals/[id]` + JSON-LD |
| Shelter profile geodata editing | Shipped | `PATCH /admin/v1/shelters/:id` |
| Applicant history at decision time | Shipped | `GET .../applications/:id/applicant-history` + History card |
| Verification provenance (who/when/which org) | Shipped | same endpoint, per-artifact timeline |
| Staff notes on applications | Shipped | `application_notes` + Notes card |
| Forgot / reset password | Shipped | `/forgot-password`, `/reset-password`, outbox email |
| Email verification (+resend) | Shipped (soft-gate banner) | `/verify-email`, dashboard banner |

Planned next (from gap analysis §1–3): photo upload pipeline UI, saved pets/favorites,
care-and-behavior facets, email-match alerts, reporting module, self-serve account
export/delete.

## M5 "Settling In" — post-adoption journeys (2026-08-23)

| Capability | Status | Where |
| --- | --- | --- |
| Adoption → journey auto-creation (day 2/14/30/365 touchpoints) | Shipped | `adoption_journeys` + applications transition hook |
| Gentle check-in emails (skip-friendly, no login) | Shipped | outbox topic `journey.checkin` + scheduler sweep |
| Token-secured check-in page (moods, topics, note) | Shipped | web `/journey?jt=` |
| Concern routing to staff case queue + risk flag | Shipped | `adoption_cases` + admin `/journeys` |
| Return intake linked to original adoption (no data erasure) | Shipped | `POST .../journeys/:id/return` |
| Gotcha-Day anniversary touchpoint | Shipped | day 365 |

Planned: photo moments, milestone badge persistence, SMS channel, foster-journey reuse (M8).

## Universal application & shared data (2026-08-25)

| Capability | Status | Where |
| --- | --- | --- |
| Universal application form (household/residence/landlord/pets/history/lifestyle/preferences/vet) | Shipped | `universal_application` JSONB + PUT/GET `/app/v1/me/universal-application` |
| Rental property registry (crowdsourced pet policies) | Shipped | `rental_properties` table + search/save endpoints |
| Post-adoption checklist (10 practical tasks) | Shipped | journey `checklist_items` JSONB + public toggle endpoint |
| Ethical nudges ("Rex noticed you haven't visited 👀") | Shipped | favorite-based sweep + outbox emails |
| Nudge preferences (opt-out) | Shipped | users.settings.nudgesEnabled |

## Known flaky tests (CI environment)
- m20 nudge sweep tests: pass in isolation, fail when full suite runs against dirty DB (shared-state pollution)
- e2e Playwright: locator timeouts on cold-start CI runners (passes with retries=2)
