# Kithlink

Open-source, multi-tenant platform for pet adoption: reusable verified applicant
artifacts, shelter admin tooling, and one-click public shelter websites.
Design docs: [`TECH_DESIGN.md`](./TECH_DESIGN.md) + [`docs/design/`](./docs/design).

## Monorepo

| Path | Package | What it is |
| --- | --- | --- |
| `apps/server` | `@kithlink/server` | NestJS Core API (auth/sessions, shelters+staff RBAC, animals CRUD, public registry) |
| `apps/web` | `@kithlink/web` | Applicant-facing Next.js site (public shelter browse) |
| `apps/admin` | `@kithlink/admin` | Shelter staff dashboard shell (login + animals list) |
| `packages/contracts` | `@kithlink/contracts` | Zod schemas — single source of truth for all API shapes |
| `packages/db` | `@kithlink/db` | Drizzle schema, migrations, RLS policies, tenant-context helpers |

## Quickstart (local dev)

Requires Node 20.11+, pnpm 10, Docker.

```bash
pnpm install
docker compose -f deploy/compose/docker-compose.yml up -d   # postgres/redis/minio/mailpit
cp deploy/compose/.env.example .env                         # DEV-ONLY credentials inside
set -a; source .env; set +a

pnpm db:migrate        # drizzle migrations + RLS policies (idempotent)
pnpm --filter @kithlink/server seed   # demo shelter: happytail / dev@kithlink.dev / DevOnly123!x

pnpm dev               # web :3000 · admin :3001 · api :4000 (turbo)
```

Smoke-check the API:

```bash
curl localhost:4000/healthz
curl "localhost:4000/public/v1/shelters"
curl "localhost:4000/public/v1/shelters/happytail/animals?limit=5"
```

## Tests

```bash
pnpm test              # offline: unit tests (integration suites auto-skip)
# full integration against the compose DB:
TEST_DATABASE_URL=postgres://kithlink_app:kithlink_app_dev@localhost:5432/kithlink \
DATABASE_OWNER_URL=postgres://kithlink:kithlink_dev@localhost:5432/kithlink \
DATABASE_URL=$TEST_DATABASE_URL pnpm test
```

- `packages/db` RLS suite proves tenant isolation at the SQL layer (cross-tenant
  reads/writes denied, anonymous sees only available animals, audit rows unreadable to staff).
- `apps/server` API suite covers register/login/session, RBAC-guarded staff and animal
  routes, public registry filtering, and cross-tenant 403s.

## Architecture invariants (do not break)

1. **RLS is the tenancy backstop.** All request DML goes through
   `withTenantContext()` / `withTenantTx()` (`@kithlink/db`), which set the
   `kithlink.*` session GUCs the row-level policies key on. The app connects as a
   non-superuser role on purpose.
2. **Contracts are the only types.** Request validation and response mapping use
   Zod schemas from `@kithlink/contracts`; never hand-roll shapes.
3. **Audit chain is append-only.** Sensitive actions append hash-chained rows via
   `AuditService`; staff contexts cannot read or delete them.
4. **Nest DI without `emitDecoratorMetadata`.** esbuild-based runners (`tsx`,
   vitest) don't emit parameter metadata — always use explicit
   `@Inject(TokenClass)` for constructor params that aren't strings.

## License plan

AGPLv3 for core; MIT for themes and client SDKs (see `docs/design/09-roadmap.md`).
