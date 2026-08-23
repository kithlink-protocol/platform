# 09 — Roadmap, Risks & Open Questions

## 1. Milestones

| Phase | Scope (acceptance criteria) | Est. |
| --- | --- | --- |
| **M0 — Foundation** | Monorepo scaffold; Compose dev env; auth+sessions; shelters/staff/RBAC; RLS live + CI policy test; animals CRUD + public registry API | 6 wks |
| **M1 — Applicant loop** | PWA profile; artifact upload (presign, envelope encryption); OCR+LLM pipeline v1 with manual fallback; applications + status machine + consent grants; email notifications | 8 wks |
| **M2 — Verification network** | Verifications UX (landlord-call flow, side-by-side audit editor); network_verified surfacing to Shelter B; applicant consent dashboard w/ revoke; audit chain | 6 wks |
| **M3 — Sites & syndication** | Theme SDK + default theme ×2; block CMS + renderer worker + atomic publishes; custom subdomains; Petfinder push adapter + RSS export | 8 wks |
| **M4 — Hardening & GA** | Load tests at SLOs; DR drills; Adopt-a-Pet adapter; docs/quickstart for self-hosters; security review + pen test; AGPLv3 repo public launch | 6 wks |

Post-GA backlog: OIDC SSO · clinic-API verifications · inbound Petfinder inquiries · foster scheduling module · i18n (ES first).

## 2. Risk Register

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

## 3. Open Questions

| # | Question | Owner | Needed by |
| --- | --- | --- | --- |
| Q1 | Legal review of artifact-sharing liability model (which entity is "verifier of record"?) | Outside counsel | before M2 exit |
| Q2 | Managed-cloud jurisdiction/data residency (US-only vs EU-capable) | CivicHearth board | M3 |
| Q3 | Petfinder partner API approval timeline & rate ceilings | Partnerships | M2 |
| Q4 | Default LLM provider contract (zero-retention terms) for managed cloud | Ops | M1 |
| Q5 | Do municipal animal controls require records retention beyond our 24-mo application default? | Research | M4 |

## 4. Decision Log (append-only)

| Date | Decision | Rationale | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-08-22 | NestJS modular monolith over microservices | Contributor accessibility; module boundaries preserve split option | Full microservice mesh (ops burden too high for nonprofit scale) |
| 2026-08-22 | Drizzle over Prisma | Transparent SQL needed for RLS GUCs, upserts, partial indexes | Prisma (heavier abstraction around raw SQL patterns we rely on) |
| 2026-08-22 | Artifacts-not-verdicts sharing model | Liability containment; respects shelter autonomy | Shared approval scores / global applicant reputation |
| 2026-08-22 | Postgres FTS v1, search engine deferred | Dataset size small per shelter; fewer moving parts for self-host | Meilisearch/Typesense day one |
