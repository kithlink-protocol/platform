# 08 — Deployment & Operations

## 1. Environments

| Env | Purpose | Data |
| --- | --- | --- |
| `local` | Compose, seeded fixtures | synthetic only |
| `staging` (managed) | E2E + migration rehearsal | anonymized subset |
| `prod` (managed) | CivicHearth cloud | real |

Migrations: `drizzle-kit` forward-only files; every PR runs migrations against staging snapshot; expand→migrate→contract pattern for zero-downtime.

## 2. Topologies

**Self-host small (Compose):** 6 containers (`web`, `api`, `worker-verify`, `worker-sync`, `renderer`, optional `clamav`) + Postgres + Redis + MinIO. Runs on 2 vCPU / 4 GB VPS for ≤50 animals. `.env.example` documents every variable incl. bring-your-own SMTP/S3/LLM keys. TLS via bundled Caddy.

**Managed / larger self-host (Helm):**

```
Ingress ─ web (HPA 2–6)            api (HPA 3–10)
        ─ sites CDN ── bucket      worker-verify (KEDA on queue depth, 0–8)
                                   worker-sync   (1–3)
Postgres: primary + sync replica, PITR via WAL archiving
Redis: sentinel (3 pods)     Grafana stack: prometheus/loki/tempo/grafana
```

## 3. CI/CD

GitHub Actions:

1. PR: typecheck → lint → unit (Vitest) → build → integration tests against ephemeral Postgres/Redis services (RLS policy test included) → OpenAPI diff check.
2. Merge to main: image build (digest-pinned) → Trivy scan → deploy staging → Playwright e2e (applicant flow, verification flow, cross-tenant denial) → manual gate → prod canary (10% traffic 30 min, auto-rollback on SLO burn).
3. Themes repo dir has separate lighter pipeline (axe a11y + visual snapshots).

## 4. Observability

| Signal | Tooling | Highlights |
| --- | --- | --- |
| Traces | OTel → Tempo | every API request + BullMQ job spans |
| Metrics | Prometheus + Grafana dashboards | RED per route; queue depth/age; parse confidence distribution; sync success rate; publish latency |
| Logs | Loki | scrubbed structured JSON (doc 07 §3) |
| Errors | Sentry (opt-in) | release-tagged, PII scrubber enabled |
| Uptime | external probes | `/public/v1/healthz` (liveness), `/readyz` (DB+Redis+bucket) |

Alert routing to ops email + Matrix channel; paging (SEV1/2) via Grafana OnCall.

## 5. SLOs

| SLI | Target |
| --- | --- |
| API availability (5xx rate) | 99.9% monthly |
| API latency p95 | < 300 ms (excl. presigned upload/download) |
| Site publish p95 end-to-end | < 60 s |
| Sync propagation p95 (edit → Petfinder) | < 60 s |
| Parse job completion p95 | < 90 s from upload-complete |
| RPO / RTO (managed) | 15 min / 4 h |

Error budget policy: budget burn > 25% freezes feature deploys for the week.

## 6. Backups & DR

- Postgres: nightly base + continuous WAL to object-lock bucket; restore drill quarterly (documented runbook, timed against RTO).
- Object storage: versioned buckets; artifact ciphertext replicated across AZs; KEK backup under KMS with dual-control recovery.
- Compose self-hosters get documented `pg_dump` + restic recipes; managed cloud handles it for them otherwise.

## 7. Capacity & Cost Model (managed cloud, year-1 target)

Assumptions: 500 shelters × avg 40 animals; 100 k applicant profiles/y; artifacts ≈ 3 files × 2 MB × 40 % of applicants/y.

| Resource | Estimate | Managed cost/mo (list-price w/o grants) |
| --- | --- | --- |
| Compute (k8s nodes, autoscaled) | ~12 vCPU avg | ~$350 |
| Postgres (16 GB managed HA) | < 200 GB | ~$120 |
| Redis | 2 GB | ~$30 |
| Storage | artifacts ~240 GB/y + photos ~500 GB + site bundles | ~$40 (R2-class egress-free) |
| LLM extraction | ~150 k pages/y × ~2k tokens | ~$50–80 (batch/self-host drops this near zero) |
| Observability | in-cluster Grafana stack | ~$40 |
| **Total** | | **~$650/mo before grants** — covered by AWS Imagine/DO credits + managed-tier revenue at ~$29/shelter/mo break-even ≈ 23 paying shelters |

## 8. Testing Strategy

| Layer | Tooling | Gate |
| --- | --- | --- |
| Unit (pure logic: scoring, redaction, mappers) | Vitest | ≥85 % on `verification-core`, `sync-adapters` |
| Contract | Zod schema ↔ generated OpenAPI diff | breaking change fails CI |
| Integration (API + DB + Redis, real RLS) | Testcontainers | all modules; includes cross-tenant denial suite |
| E2E | Playwright (desktop + mobile emulation) | golden journeys G1–G3 |
| Load | k6 | 500 rps mixed read / 50 rps write sustained, SLOs hold |
| A11y | axe-core in Playwright + manual screen-reader pass per theme | WCAG 2.1 AA |
