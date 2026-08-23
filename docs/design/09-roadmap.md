# 09 — Roadmap, Risks & Open Questions

## 1. Milestones

M0–M4 are **shipped** (v1.0.0-rc.1). Scope landed as follows (commit subjects
summarised; see `git log`):

| Phase | Status | What actually shipped |
| --- | --- | --- |
| **M0 — Foundation** | ✅ Shipped (`7de5b8d`) | Monorepo, RLS-secured DB, core API (auth/sessions, shelters/staff/RBAC, animals CRUD, public registry), web/admin shells |
| **M1 — Applicant loop** | ✅ Shipped (`7d5c488`) | Profile, artifact upload w/ presign + envelope encryption, parse skeleton with manual fallback (LLM stage off unless configured), applications + status machine + consent grants, email notifications; Playwright e2e gate added |
| **M2 — Verification network** | ✅ Shipped (`c311d72`) | Verification actions on artifact cards (confirm landlord call / mark discrepancy / accept prior verification), network_verified surfacing, consents list + revoke API, append-only audit log |
| **M3 — Sites & syndication** | ✅ Shipped (`13f1938`) | Headless CMS config + renderer with atomic publishes, two themes, one-click setup, subdomain serving via web middleware, custom-domain claim→TXT verify (Beta), Petfinder push adapter (dry-run/live), RSS export |
| **M4 — Hardening & GA** | ✅ Shipped (`7506bd7`) | Rate limiting, version/health endpoints, load smoke script, Adopt-a-Pet adapter (API level), self-host docs/guides, CI e2e green; repo public at v1.0.0-rc.1 |
| Post-M4 polish | ✅ Shipped (`4aa31f5`, `41da062`) | Geist-informed visual system across web/admin/generated sites, user guides + deployment/troubleshooting docs |

Scope deltas vs. the original plan: verifications shipped as per-artifact
actions rather than a side-by-side audit editor; LLM extraction is opt-in
(manual fallback is the default path); Adopt-a-Pet exists as an adapter but is
not yet in the UI dropdown; load testing is a manual smoke script, not k6 in
CI.

## 2. Remaining backlog (current truth)

- Dedicated consents UI page (revoke currently API-only: `GET/DELETE /app/v1/me/consents`)
- Animal create/edit UI forms (CRUD is admin-API only)
- Staff-management UI (staff endpoints are admin-API only)
- Adopt-a-Pet option in the `/sync` provider dropdown (adapter exists)
- Magic-link email verification (accounts today are email+password only)
- TOTP second-factor UI
- Clinic-API verifications
- Petfinder inbound inquiries (outbound push only today)
- Live LLM extraction wired on by default (currently operator opt-in)
- i18n (ES first)
- Managed-cloud Helm chart polish
- k6 load tests in CI (manual `scripts/load/smoke.js` today)
- Swap to actual Geist font once Next.js supports it (visual system is Geist-informed)

Longer-term ideas carried from planning: OIDC SSO · foster scheduling module.

## 3. Risk Register

| # | Risk | Likelihood×Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Shelters won't trust "another shelter verified this" → feature ignored | M×H | Verification UI frames artifacts as *evidence w/ provenance*, never as approval; each shelter still explicitly accepts/re-verifies |
| R2 | Liability claim from a wrong verification | L×H | Human-attested model (named verifier per confirmation); legal review pre-GA; disclaimers in TOS; audit chain supports defense |
| R3 | Volunteer churn breaks shelter ops | H×M | Dead-simple admin UX, role handover tooling, managed-cloud support tier |
| R4 | LLM extraction quality below bar on real-world photos | M×M | Manual-entry path is first-class (pipeline failure ≠ blockage); confidence routing; telemetry-driven prompt iteration; optional cloud OCR tier |
| R5 | Sync provider API changes/quota cuts | M×M | Adapter isolation, VCR fixtures, RSS fallback keeps sites alive regardless |
| R6 | Affiliate program perceived as data monetization | M×H (reputational) | Contextual links only (no profile transfer, no tracking pixels on adopter dashboards); opt-in per adopter; published revenue policy |
| R7 | Self-hosters misconfigure storage/security | M×M | Secure-by-default Compose (generated secrets, TLS via Caddy), config linter `kithlink doctor`, hardening guide |
| R8 | AGPLv3 scares away institutional contributors | L×L | Clear dual-license FAQ; templates/SDK MIT; CLA-free DCO contribution flow |

## 4. Open Questions

| # | Question | Owner | Needed by |
| --- | --- | --- | --- |
| Q1 | Legal review of artifact-sharing liability model (which entity is "verifier of record"?) | Outside counsel | before M2 exit |
| Q2 | Managed-cloud jurisdiction/data residency (US-only vs EU-capable) | CivicHearth board | M3 |
| Q3 | Petfinder partner API approval timeline & rate ceilings | Partnerships | M2 |
| Q4 | Default LLM provider contract (zero-retention terms) for managed cloud | Ops | M1 |
| Q5 | Do municipal animal controls require records retention beyond our 24-mo application default? | Research | M4 |

## 5. Decision Log (append-only)

| Date | Decision | Rationale | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-08-22 | NestJS modular monolith over microservices | Contributor accessibility; module boundaries preserve split option | Full microservice mesh (ops burden too high for nonprofit scale) |
| 2026-08-22 | Drizzle over Prisma | Transparent SQL needed for RLS GUCs, upserts, partial indexes | Prisma (heavier abstraction around raw SQL patterns we rely on) |
| 2026-08-22 | Artifacts-not-verdicts sharing model | Liability containment; respects shelter autonomy | Shared approval scores / global applicant reputation |
| 2026-08-22 | Postgres FTS v1, search engine deferred | Dataset size small per shelter; fewer moving parts for self-host | Meilisearch/Typesense day one |
