# Restore Drill (Quarterly)

Proves RTO/RPO claims from `docs/design/08-deployment-ops.md` §5/§6 against the
Compose stack. Run every quarter; log results in the table at the bottom.
Owner: on-call ops. Duration budget: 2 h.

## Prerequisites

- Compose stack running (`deploy/compose/docker-compose.yml`).
- A backup artifact: `pg_dump -Fc` taken by the nightly job, or generate one
  fresh for a first-time drill:
  ```bash
  pg_dump -h localhost -U kithlink -d kithlink -Fc -f /tmp/kithlink-drill.dump
  ```

## Procedure

1. **Isolate the target.** Never restore over live data — use a scratch DB:
   ```bash
   psql -h localhost -U kithlink -d postgres \
     -c "DROP DATABASE IF EXISTS kithlink_drill" \
     -c "CREATE DATABASE kithlink_drill"
   ```
2. **Restore** (stop the clock start before this line):
   ```bash
   pg_restore -h localhost -U kithlink -d kithlink_drill --no-owner --jobs=4 /tmp/kithlink-drill.dump
   ```
3. **Replay roles/extensions** if restoring into an empty cluster (the dump
   contains them only with `--create`; we restore into an existing DB):
   ```bash
   psql -h localhost -U kithlink -d kithlink_drill \
     -f deploy/compose/initdb/01-roles.sql \
     -f deploy/compose/initdb/02-extensions.sql
   ```
4. **Verify integrity:**
   ```bash
   psql -h localhost -U kithlink -d kithlink_drill -c "
     select count(*) as shelters from shelters;
     select count(*) as animals from animals;
     select count(*) as artifacts from artifacts;
     select count(*) as audit_rows from audit_log;"
   ```
   Row counts must be ≥ the pre-backup snapshot minus expected drift. Confirm
   the audit hash chain validates end-to-end (chain verification job or SQL
   walk) and that RLS still denies cross-tenant reads when queried as
   `kithlink_app`.
5. **Boot the API against the copy** and smoke it:
   ```bash
   DATABASE_URL=postgres://kithlink_app:kithlink_app_dev@localhost:5432/kithlink_drill \
   TEST_DATABASE_URL=$DATABASE_URL KITHLINK_MASTER_KEY=<drill-key> \
     pnpm --filter @kithlink/server exec tsx src/main.api.ts &
   curl -fsS localhost:4000/healthz
   curl -fsS "localhost:4000/public/v1/shelters"
   ```
6. **Object store spot-check**: decrypt one artifact with the drill master key;
   failure here means key rotation broke envelope encryption (see breach
   playbook §4).
7. **Teardown**: drop `kithlink_drill`, kill the temp API process.

## RTO timing table

| Step | Start | End | Elapsed |
| --- | --- | --- | --- |
| Scratch DB created | | | |
| pg_restore complete | | | |
| Roles/extensions applied | | | |
| Verification queries pass | | | |
| healthz + public API green | | | |
| **Total (= RTO demonstrated)** | | | |

Target: **RTO ≤ 4 h**, **RPO ≤ 15 min** (WAL archiving cadence). A drill that
exceeds either target opens a SEV3 incident with a remediation item.

## Drill log

| Date | Backup age | Restore size | RTO | RPO gap | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
