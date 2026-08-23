# Self-hosting Kithlink

Production quickstart expanding on the dev-focused `README.md`. Target: one
2 vCPU / 4 GB VPS for ≤ 50 animals (doc08 §2). Requires Docker + Compose v2,
Node 20.11+/pnpm 10 for builds, and a domain with DNS pointing at your host.

## 1. Production quickstart

```bash
git clone https://github.com/krishnacore/kithlink && cd kithlink
pnpm install
docker compose -f deploy/compose/docker-compose.yml up -d        # postgres/redis/minio/mailpit
cp deploy/compose/.env.example .env                              # then EDIT — dev creds are not safe
set -a; source .env; set +a

# generate real secrets before first migrate:
openssl rand -base64 32            # -> KITHLINK_MASTER_KEY
openssl rand -hex 16               # -> DB passwords of your choice

pnpm db:migrate                    # drizzle migrations + idempotent RLS policies
pnpm turbo build
docker compose -f deploy/prod/docker-compose.yml up -d || node apps/server/dist/main.api.js
```

Verify: `curl localhost:4000/healthz` → `{"ok":true}`,
`curl "localhost:4000/public/v1/shelters"` returns a JSON array.

## 2. Environment matrix

Every variable in `deploy/compose/.env.example`. **Bold** = must change from
the example before production.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | dev role creds | Runtime app role (`kithlink_app`) — non-superuser so RLS applies. **Change password.** |
| `DATABASE_OWNER_URL` | migrations only | superuser creds | Used by `db:migrate` for DDL/policies; never given to the API process in prod. |
| `REDIS_URL` | yes | `redis://localhost:6379` | BullMQ parse/notify queues. Set a password or bind to a private network. |
| `S3_ENDPOINT` | yes | MinIO local | Any S3-compatible endpoint (MinIO, Wasabi, R2). |
| `S3_REGION` | yes | `us-east-1` | Match your provider. |
| `S3_BUCKET` | yes | `kithlink-local` | Artifacts + rendered sites. **Private** except the public-read prefix for published sites. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | yes | dev values | **Rotate.** |
| `KITHLINK_MASTER_KEY` | prod: yes | derived from DATABASE_URL hash (+ warning) | 32-byte base64 KEK for envelope encryption (addresses, artifacts). Rotating it crypto-shreds old objects — see breach playbook §4. **Never reuse across environments.** |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | no | unset = no LLM stage | OpenAI-compatible OCR-extraction endpoint for worker-verify; manual entry works without it. Use a zero-retention provider if possible. |
| `SMTP_URL` | yes | Mailpit dev relay | e.g. `smtp://user:pass@smtp.example.com:587`. |
| `MAIL_FROM` | yes | `"Kithlink <no-reply@localhost>"` | Set to a domain you control (SPF/DKIM). |
| `APP_URL` / `ADMIN_URL` | yes | localhost:3000/3001 | Comma-separated extras allowed; used for CORS origins. |
| `API_URL` | yes | `http://localhost:4000` | Same-origin `/api` rewrite target for web/admin. |
| `API_PORT` | no | `4000` | API listen port. |
| `ENABLE_SYNC_CRON` | no | unset | `1` enables the nightly listing-sync run over live targets. |
| `PETFINDER_MODE` / `ADOPTAPET_MODE` | no | `dry_run` | Force an adapter into sandbox regardless of per-target mode. Keep `dry_run` until partner credentials are approved. |
| `PETFINDER_API_BASE` / `ADOPTPET_API_BASE` | no | official APIs | Override only for tests/proxies. |
| `RATE_LIMIT_OFF` | no | unset | `1` disables in-memory rate limiting. **Leave unset in prod.** |

## 3. TLS via Caddy

Bundled Caddyfile pattern — automatic ACME certs, proxies api/web/admin plus a
public route for the *sites* object-store prefix:

```caddy
# deploy/caddy/Caddyfile
example.org {
    redir /api/* / 302

    handle /api/* {
        uri strip_prefix /api
        reverse_proxy api:4000
    }
    handle {
        reverse_proxy web:3000
    }
}

admin.example.org {
    reverse_proxy admin:3001
}

# Published shelter sites live under the bucket's public-read prefix.
sites.example.org {
    # MinIO serves the kithlink bucket read-only for this subdomain.
    reverse_proxy minio:9000
}
```

Point `APP_URL=https://example.org`, `ADMIN_URL=https://admin.example.org`,
`API_URL=https://example.org/api`, and set the bucket's site-public policy:

```bash
mc anonymous set download local/kithlink/sites/
```

Caddy sets HSTS by default; helmet covers the remaining headers at the API.

## 4. Backups

Nightly logical backup + encrypted offsite copy with restic:

```bash
# /etc/cron.daily/kithlink-backup
#!/bin/sh
set -eu
pg_dump -h 127.0.0.1 -U kithlink -d kithlink -Fc \
  -f /var/backups/kithlink/db-$(date +%F).dump
find /var/backups/kithlink -name 'db-*.dump' -mtime +14 -delete

restic backup /var/backups/kithlink /var/lib/docker/volumes/compose_minio_data \
  --tag kithlink-$(date +%F)
restic forget --keep-daily 14 --keep-weekly 8 --prune
```

Store `KITHLINK_MASTER_KEY` **separately** from restic's repo key — a backup
bundle that contains both is a breach waiting for a thief. Restore procedure:
quarterly drill, see `docs/runbooks/restore-drill.md`.

## 5. Upgrades

Migrations-first, forward-only (expand → migrate → contract):

```bash
git fetch --tags && git checkout vX.Y.Z
pnpm install --frozen-lockfile=false
DATABASE_OWNER_URL=... pnpm db:migrate      # 1. schema moves first
pnpm turbo build                            # 2. then new code
systemctl restart kithlink-api kithlink-worker-verify kithlink-worker-sync
```

Rollback = redeploy previous tag; never edit applied migrations. Check
`docs/design/09-roadmap.md` decision log + changelog for manual steps before
upgrading across minor versions.
