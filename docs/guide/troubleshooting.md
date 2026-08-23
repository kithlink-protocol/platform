# Troubleshooting

Common issues across the applicant app, staff app, API, and self-hosted
deployments.

Contents:

- [Login loops / can't stay signed in](#login-loops--cant-stay-signed-in)
- [Site returns 404 after publish](#site-returns-404-after-publish)
- [Sync dry-run shows decisions but no Petfinder listing](#sync-dry-run-shows-decisions-but-no-petfinder-listing)
- ["Missing session cookie" on API calls from other localhost ports](#missing-session-cookie-on-api-calls-from-other-localhost-ports)
- [Migration fails mid-way](#migration-fails-mid-way)
- [HTTP 429 rate-limit errors](#http-429-rate-limit-errors)

## Login loops / can't stay signed in

**Symptom:** You sign in successfully but every subsequent request behaves as
if you're logged out, or login immediately bounces back.

**Cause:** In production (`NODE_ENV=production`) the session cookie is named
`__Host-kithlink_session` and is set with `Secure`. Browsers only accept/store
`__Host-` cookies over **HTTPS**. Serving prod over plain HTTP means the cookie
is silently dropped and every request looks anonymous ("Missing session
cookie" in API logs).

**Fix:**

- Serve the stack behind TLS (Caddy, nginx, or a platform LB). A ready Caddy
  snippet is in [Self-hosting §3](../self-hosting.md#3-tls-via-caddy).
- For quick internal testing, `curl -k https://…` through the proxy, or run in
  dev mode where the cookie is plain `kithlink_session` over HTTP.
- Also confirm system clock skew isn't expiring sessions instantly; sessions
  last 30 days.

## Site returns 404 after publish

**Symptom:** `/public/v1/sites/<slug>` worked before; now 404 — or a fresh
publish 404s immediately.

**Checks, in order:**

1. **Is MinIO up?** Published sites are served from object storage
   (`docker compose ps`, or hit the MinIO console on port 9001 in dev). If S3
   is down, site serving fails.
2. **Does the `CURRENT` object exist?** The public route reads
   `sites/<slug>/CURRENT` to find the live build, then serves `index.html`,
   `animals.html`, or `sitemap.txt` from that build. If `CURRENT` is missing
   (e.g. bucket wiped, wrong `S3_BUCKET`), you get 404 even though config
   saved fine. Re-publish from the staff app's **Site** page (**Publish**
   button) to regenerate it.
3. Slug typos matter: slugs are lowercase `[a-z0-9-]`.

## Sync dry-run shows decisions but no Petfinder listing

**This is expected behavior.** In `dry_run` mode the adapter evaluates what it
*would* push and records per-animal decisions locally — it never calls the
Petfinder network. Nothing will appear on Petfinder regardless of how many
times you click **Run sync** while mode is `dry_run`.

To actually push:

1. Staff app → **Sync** → set **Mode** to `live` → **Save target**.
2. Click **Run sync** and watch "Pushed N, failed M".
3. If runs still fail in live mode, check your Petfinder client credentials and
   whether the operator forced sandbox via `PETFINDER_MODE=dry_run`
   (`ADOPTAPET_MODE` likewise) — env override beats per-target mode.

## "Missing session cookie" on API calls from other localhost ports

**Symptom:** The apps work normally, but direct browser calls to
`http://localhost:4000/...` fail with 401 / RLS errors about a missing session
cookie, even though you're logged in.

**Cause:** Cookies are scoped per site, and the web/admin apps talk to the API
through their own origin: Next.js rewrites `/api/*` on `localhost:3000`/`:3001`
to the backend at `localhost:4000`. Your session cookie lives on the app
origin; hitting `:4000` directly from another page/context sends no cookie, so
the server has no principal and row-level security correctly denies access.

**Fix:** Always call the API through the same-origin `/api` path of whichever
app you're using. For scripting against the API, log in first
(`POST /app/v1/auth/login`) and reuse the returned session cookie on the API
origin itself.

## Migration fails mid-way

**Symptom:** `pnpm db:migrate` errors partway through (connection drop,
previous failed state, etc.).

**What's safe:**

- RLS policy statements are **idempotent** — re-running `pnpm db:migrate`
  re-applies policies without duplicating them. It is always safe to rerun.
- Fix the underlying cause (wrong `DATABASE_OWNER_URL`, DB not up), then rerun
  the same command. Don't hand-edit applied migrations; forward-only.

If a data migration half-applied, restore from backup per
[docs/runbooks/restore-drill.md](../runbooks/restore-drill.md).

## HTTP 429 rate-limit errors

Kithlink applies in-memory rate limiting by default:

| Scope | Limit |
| --- | --- |
| Anonymous requests | 60/min per IP |
| Authenticated requests | 300/min |
| Presign endpoints | 20/min per user |
| Login | 10/min per IP |

On 429s: back off and retry after the window rolls; for login lockouts wait a
minute rather than retrying rapidly. Operators should keep `RATE_LIMIT_OFF`
**unset** in production — setting it to `1` disables limiting entirely (dev/test
only).

Still stuck? Check structured JSON logs from the API process for the failing
request, and compare deployed code with `GET /public/v1/version`.

For incident handling and security reports see
[SECURITY.md](../../SECURITY.md) and the runbooks in
[docs/runbooks/](../runbooks/) (incident severity, data-breach playbook,
restore drill).
