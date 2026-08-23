# Kithlink — Technical Design Document (Master Index)

| Field | Value |
| --- | --- |
| Project | Kithlink — The Kithlink Protocol |
| Parent Org | CivicHearth Collective |
| Version | 1.0-DRAFT |
| Status | Proposed / Design Phase |
| License Plan | AGPLv3 (core) · MIT (templates & client SDKs) |

## Design Docs

| # | Document | Contents |
| --- | --- | --- |
| 01 | [Architecture](./docs/design/01-architecture.md) | System context, container diagram, service decomposition, monorepo layout, tech stack rationale |
| 02 | [Data Model](./docs/design/02-data-model.md) | ERD, PostgreSQL DDL, multi-tenant RLS, entity state machines, retention policy |
| 03 | [API Specification](./docs/design/03-api.md) | Auth design, RBAC matrix, endpoint catalog, webhooks, error model, versioning |
| 04 | [Verification Engine](./docs/design/04-verification-engine.md) | OCR/LLM pipeline, confidence scoring, human-in-loop audit, envelope encryption, artifact lifecycle |
| 05 | [Sync & Integrations](./docs/design/05-sync-integrations.md) | Petfinder / Adopt-a-Pet bidirectional sync, conflict resolution, RSS export |
| 06 | [Headless CMS & Site Generator](./docs/design/06-cms-site-generator.md) | Rendering pipeline, theme SDK, custom domains, publish flow |
| 07 | [Security & Privacy](./docs/design/07-security-privacy.md) | Threat model (STRIDE), consent architecture, PII handling, audit chain, incident response |
| 08 | [Deployment & Operations](./docs/design/08-deployment-ops.md) | Docker Compose / Helm topology, CI/CD, observability, SLOs, capacity & cost model, testing strategy |
| 09 | [Roadmap, Risks & Open Questions](./docs/design/09-roadmap.md) | Milestones M0–M4 (shipped), remaining backlog, risk register, decision log |
| 10 | [Visual Design](./docs/design/10-visual-design.md) | Geist-informed visual system: tokens, typography, components across web/admin/generated sites |

CI reality check: there is no status badge — CI is
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml), which runs on pushes
to `main` and on PRs (build → typecheck → lint → unit/integration against
Postgres/MinIO → Playwright e2e journeys). A green run is the readiness signal.

---

## 1. Executive Summary

Kithlink is an open-source, multi-tenant platform and protocol that fixes two structural problems in North American pet adoption:

1. **Redundant applicant verification.** Independent shelters, municipal animal controls, and foster networks each re-collect and re-verify identical documents (leases, vet records, government ID). Kithlink turns these into **portable, authenticated artifacts** that travel with the applicant across participating shelters under explicit consent.
2. **Fragmented, aging web presence.** Most small shelters have no maintainable website. Kithlink ships a **headless CMS + one-click site generator** coupled live to shelter inventory, with automatic syndication to Petfinder and Adopt-a-Pet.

### 1.1 Design Principles

| Principle | Consequence in this design |
| --- | --- |
| **Artifacts, not verdicts** | Kithlink never shares approval decisions between shelters. It verifies *documents* (lease authenticity, vet record authenticity) and lets each shelter make its own adoption decision. This caps legal/liability exposure. |
| **Consent is the unit of access** | No global applicant directory exists. Artifact decryption keys are released to a shelter only while an application-scoped consent grant is active. |
| **Small-org first** | A volunteer with no technical background must be able to run a shelter on Kithlink. Self-hosting via `docker compose up` is a supported path; the managed cloud is optional, never required. |
| **Open protocol, boring tech** | Every integration surface (API, export formats, verification schema) is documented and versioned so third parties can build against Kithlink without us. Postgres/Redis/S3 — nothing exotic. |
| **Privacy by architecture** | Encryption happens before data leaves the application process; LLM parsing runs against minimized text by default; raw documents are never sent to third-party model providers unless the operator explicitly configures and discloses it. |

### 1.2 Goals

- G1: Applicant completes one profile + uploads artifacts once; applies to N shelters with ≤3 clicks each.
- G2: A verified artifact at Shelter A is surfaced pre-verified (with audit trail) to Shelter B within seconds of Shelter B receiving a new application.
- G3: Shelter launches an accessible public website in <15 minutes; inventory edits propagate to the site and Petfinder within 60 seconds.
- G4: Self-hosted deployment runs on a single $10–20/mo VPS for a shelter with up to ~50 animals.
- G5: All sensitive document handling is auditable end-to-end (who accessed what, when, why).

### 1.3 Non-Goals (v1)

- Payments/donation processing (deferred; donation link-outs only).
- Foster-home scheduling/volunteer shift management (adjacent product).
- In-app messaging between adopters and shelters (email notifications only in v1).
- AI-generated adoption decisions. LLMs are used **only** for structured extraction from documents, never for eligibility judgment.

## 2. Personas & Primary Use Cases

| Persona | Description | Top jobs-to-be-done |
| --- | --- | --- |
| **Applicant (adopter)** | Mobile-first user, often on a phone during evenings/weekends | Build reusable profile; upload lease/vet docs once; track applications; control who sees what |
| **Shelter volunteer/staff** | Non-technical, part-time, high turnover | Add/edit animals fast; triage applications; click-to-verify artifacts; publish website changes |
| **Shelter admin** | Tech-comfortable lead at a rescue | Configure team/RBAC, sync targets, site theme, custom domain; export data |
| **Platform operator (CivicHearth)** | Runs managed cloud | Multi-tenant ops, backups, abuse monitoring, grant reporting metrics |
| **Self-hoster** | Technical volunteer at a larger org | Deploy via Compose/Helm, own their data, bring their own SMTP/S3/LLM keys |

## 3. Scope Summary

Three products ship as one codebase (monorepo), independently deployable artifacts:

1. **Applicant Web App (PWA)** — installable, offline-tolerant forms, camera-based document capture.
2. **Shelter Admin Dashboard** — multi-tenant SPA backed by Core API.
3. **Public shelter websites** — statically generated per-shelter sites served from edge/object storage, regenerated on inventory change.

Backed by four server-side components: **Core API**, **Verification Worker**, **Sync Worker**, **Site Renderer** (see doc 01).
