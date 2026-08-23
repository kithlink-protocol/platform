# 01 — Architecture

## 1. System Context (C4 Level 1)

```
                    ┌──────────────┐        ┌─────────────────┐
                    │  Applicants  │        │ Shelter staff / │
                    │   (PWA)      │        │    admins       │
                    └──────┬───────┘        └────────┬────────┘
                           │ HTTPS                   │ HTTPS
                           ▼                         ▼
   ┌──────────┐   ┌──────────────────────────────────────────┐   ┌──────────────┐
   │ Petfinder│◄──┤              KITHLINK PLATFORM           ├──►│ Adopt-a-Pet  │
   │   API    │   │  Core API · Workers · Sites · Registry   │   │     API      │
   └──────────┘   └───────┬──────────────────────┬───────────┘   └──────────────┘
                          │                      │
                          ▼                      ▼
                 ┌────────────────┐     ┌─────────────────────────┐
                 │ SMTP / Email   │     │ S3-compatible storage   │
                 │ provider       │     │ Postgres · Redis        │
                 └────────────────┘     └─────────────────────────┘
                          │
                          ▼ (optional, operator-configured)
                 ┌────────────────┐
                 │ LLM provider   │  OpenAI-compatible endpoint or self-hosted vLLM/Ollama
                 └────────────────┘
```

## 2. Container View (C4 Level 2)

| Container | Runtime | Tech | Responsibility |
| --- | --- | --- | --- |
| **Applicant PWA** | Browser / installed PWA | Next.js (App Router), TS, Tailwind, TanStack Query | Profile, artifact upload, applications, consent management |
| **Admin Dashboard** | Browser | Next.js, TS, Tailwind + shadcn/ui | Animal CRUD, application triage, verification audit queue, CMS editor, settings/RBAC |
| **Core API** | Node process (container `api`) | NestJS, Drizzle ORM, PostgreSQL | AuthN/Z, business logic, consent enforcement, public registry read API, webhook dispatch |
| **Verification Worker** | Node process (container `worker-verify`) | NestJS standalone app + BullMQ | OCR → LLM extraction → confidence scoring → audit queue; encryption envelope handling |
| **Sync Worker** | Node process (container `worker-sync`) | NestJS standalone + BullMQ | Bidirectional Petfinder/Adopt-a-Pet sync; RSS export generation; rate-limit-aware scheduling |
| **Site Renderer** | Node process (container `renderer`), invoked via job | Next.js SSG build-in-worker or per-site static export | Regenerates shelter site on inventory/CMS change; uploads to object storage |
| **PostgreSQL 16** | Managed/self-hosted | RLS-enabled multi-tenant schema | System of record |
| **Redis (Valkey)** | Managed/self-hosted | BullMQ queues, cache, rate limits | Job orchestration |
| **Object Storage** | S3 / R2 / MinIO | Presigned upload/download URLs | Encrypted artifacts, animal photos, generated site bundles |

### 2.1 Deployment shape

- **Dev/small self-host:** one `docker-compose.yml` — `api`, `worker-verify`, `worker-sync`, `renderer`, `web` (Next.js serving both PWA and dashboard builds), Postgres, Redis, MinIO.
- **Managed cloud / larger self-host:** Kubernetes Helm chart. Each container scales independently. Sites are served from CDN in front of the object-storage bucket; `api` and workers never serve public site traffic.

### 2.2 Modular monolith → services path

The backend is a **modular monolith**: one NestJS codebase with hard module boundaries (`AuthModule`, `AnimalsModule`, `ApplicationsModule`, `ArtifactsModule`, `ConsentModule`, `SitesModule`, `SyncModule`, `WebhooksModule`). The two workers import only the modules they need and run as standalone bootstrap contexts. If extraction or sync ever needs independent scaling/teams, module boundaries map 1:1 to service splits. This avoids premature microservice overhead for an open-source contributor base.

## 3. Monorepo Layout

pnpm workspaces + Turborepo:

```
kithlink/
├── apps/
│   ├── web/                  # Next.js: applicant PWA routes (/) 
│   ├── admin/                # Next.js: dashboard routes (/admin) — same origin, separate bundle
│   └── server/               # NestJS: api + worker bootstraps
│       ├── src/main.api.ts
│       ├── src/main.worker-verify.ts
│       ├── src/main.worker-sync.ts
│       └── src/modules/{auth,animals,applications,artifacts,consent,sites,sync,webhooks,notifications}
├── packages/
│   ├── db/                   # Drizzle schema, migrations, RLS policy SQL
│   ├── contracts/            # Zod schemas + OpenAPI types shared client/server (single source of truth)
│   ├── verification-core/    # Pure logic: parsers, confidence scoring, redaction (no I/O)
│   ├── sync-adapters/        # Petfinder/AdoptAPet adapter interfaces + implementations
│   ├── theme-sdk/            # MIT-licensed theme contract + types for template authors
│   └── ui/                   # Shared design system components
├── themes/                   # MIT-licensed site templates (theme-default, theme-rescue-min…)
├── deploy/
│   ├── compose/              # docker-compose.yml + .env.example
│   └── helm/kithlink/
├── docs/design/              # This document set
└── turbo.json
```

Key rule: **all request/response shapes live in `packages/contracts` as Zod schemas**. OpenAPI is generated from them; clients never hand-roll types.

## 4. Technology Decisions & Rationale

| Decision | Choice | Why this over alternatives |
| --- | --- | --- |
| Language | TypeScript everywhere | Volunteer-contributor pool overlaps heavily with JS/TS; end-to-end type safety via `contracts` package |
| Backend framework | NestJS | Module system maps to our monolith→services path; DI makes workers trivially reusable of core modules; mature guards/interceptors for RBAC + tenant scoping |
| ORM | Drizzle | SQL-first: RLS session variables, partial indexes, and `INSERT … ON CONFLICT` used by sync need transparent SQL; lighter cold-start than Prisma for workers |
| Frontend | Next.js 14 App Router ×2 apps | SSG/ISR powers both applicant PWA shell and public sites; single React skill set |
| DB | PostgreSQL 16 + **Row-Level Security as the tenancy backstop** | Defense-in-depth: application-level scoping *and* DB-enforced isolation (see doc 02 §3) |
| Queue | BullMQ on Redis/Valkey | Delayed/repeatable jobs, rate-limited groups (needed for Petfinder quotas), DLQ built in |
| Object storage | S3-compatible + presigned URLs | Client uploads go direct-to-bucket; API never proxies multi-MB files |
| Search | Postgres FTS (v1) | Animal search is small (10s–1000s rows/shelter); Meilisearch documented as optional swap |
| LLM access | Provider-agnostic adapter (OpenAI-compatible) | Operators choose hosted API or self-hosted vLLM/Ollama; default posture = minimize PII sent (doc 04 §5) |
| OCR | Tesseract (WASM worker) primary; cloud OCR adapter optional | Zero-cost default for self-hosters; quality upgrade path without lock-in |
| AuthN | Session cookies (httpOnly) + Argon2id passwords, magic-link email verify, TOTP MFA | No external IdP dependency for self-hosters; OIDC federation deferred to v1.x (doc 03 §2) |
| Observability | OpenTelemetry → Prometheus/Loki/Tempo (Grafana stack); Sentry opt-in | Self-host friendly defaults; managed cloud ships the Grafana stack in-cluster |

## 5. Request Topology Rules

1. Browsers talk **only** to `api.<host>` and `<shelter>.sites.<host>` (or custom domains). Direct DB/Redis/storage access is prohibited outside the private network.
2. All artifact bytes move browser ⇄ bucket via **short-TTL presigned PUT/GET** issued by Core API after authorization. The API validates checksum + MIME after upload before creating the artifact record (doc 04 §3).
3. Every mutating API call carries `Idempotency-Key` where retriable (applications, animal upserts from sync).
4. Public registry reads (`/public/v1/*`) are unauthenticated, cached at CDN 60 s, and expose **zero applicant data**.

## 6. Cross-Cutting Concerns (owned by Core API infrastructure layer)

| Concern | Mechanism |
| --- | --- |
| Tenancy context | Guard resolves user→shelter membership → sets `res.locals.tenant`; Drizzle transaction wrapper issues `SET LOCAL kithlink.shelter_id` (doc 02 §3) |
| Audit | Interceptor writes append-only, hash-chained `audit_logs` rows for every sensitive action (doc 07 §6) |
| Feature flags | Per-shelter flags table evaluated by guard; no third-party flag service |
| Rate limiting | Redis token buckets keyed by IP+route class; stricter buckets for auth and upload-signing endpoints |
| Notifications | Domain events → outbox pattern (`outbox_events` table) → dispatcher job sends email/webhook; guarantees at-least-once with idempotent consumers |
