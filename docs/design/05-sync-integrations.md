# 05 — Sync & External Integrations

Bidirectional inventory sync between each shelter's Kithlink record and discovery channels. Owned by `worker-sync` + `packages/sync-adapters`.

## 1. Adapter Contract

```ts
interface SyncAdapter {
  readonly provider: 'petfinder' | 'adoptapet';
  readonly capabilities: { push: boolean; pull: boolean; photos: boolean; remove: boolean };

  // Auth handled per-target; adapters receive a TokenProvider (refresh transparent)
  pushAnimals(t: TenantCtx, animals: AnimalPayload[]): Promise<PushResult[]>;
  pullStatuses?(t: TenantCtx, since: Date): Promise<ExternalStatus[]>;
  removeAnimal(t: TenantCtx, externalId: string): Promise<void>;
}
```

`TenantCtx` carries per-shelter encrypted credentials (`sync_targets.credentials_enc`, envelope-encrypted like artifacts). Workers decrypt in-memory only.

## 2. Sync Model

- **Direction: Kithlink → channels is the source of truth for content** (photos, description, traits). Channels are source of truth only for *their own* status events where supported (e.g., inquiry created) — delivered via webhook into `internal/v1/sync/:provider/callback`.
- **Trigger paths:** (a) domain event `animal.updated|created|status_changed` enqueues targeted job with 5 s debounce per animal; (b) nightly full reconciliation per target (drift repair); (c) manual "Sync now" button.
- **Rate limits:** BullMQ group per provider+shelter with `limiter.max/min`; Petfinder default 50 req/min/shelter, jittered.
- **Idempotency mapping:** `animals.external_refs` JSONB stores `{petfinder:"…", adoptapet:"…"}`. Upsert = `SELECT … FOR UPDATE` on animal row → adapter upsert by stored ref or dedupe on (name+species+microchip).

### 2.1 Conflict resolution (nightly reconciliation)

```
for each animal with external_ref:
  remote = adapter.fetch(id)
  diff vs local (content hash snapshot from last successful push)
  if local_hash == last_pushed_hash and remote differs → remote drifted:
       adopt remote ONLY for whitelisted fields (adoption_status, inquiries_count); log others
  else if local changed since last push → re-push local (local wins)
  else → no-op
```

All drift decisions append to `sync_runs.decisions_json` for operator review.

## 3. Petfinder Specifics

- Auth: client-credentials OAuth2; token cached in Redis w/ expiry −60 s.
- Mapping highlights (full table in `sync-adapters/petfinder/mapping.ts`):

| Kithlink | Petfinder |
| --- | --- |
| status available/pending/adopted | adoptable / pending / `remove` |
| species dog/cat/other | dog/cat/rabbit,… (mapper table) |
| traits_json.good_with_kids | `attributes.children_ok` |
| medical_json.vaccinations | `tags` + description snippet |
| primary photo | first photo by position |

- Photos pushed by URL (Petfinder fetches) pointing at signed CDN URLs with 7-day TTL; refresh job re-signs weekly.

## 4. RSS Export (zero-integration fallback)

Every shelter gets `GET /public/v1/feed/shelters/:slug/rss.xml` — full inventory with media enclosures, cached 5 min at CDN. Lets any platform ingest without credentials and gives small shelters an instant win before API approvals arrive.

## 5. Inbound Inquiries (v1.x)

Petfinder "contact" webhooks → create lightweight lead row + email notification; full application funnel stays native to Kithlink. Schema reserved (`leads` table), out of v1 scope.

## 6. Operational Rules

- Every run writes a `sync_runs` row: `{target_id, trigger, started_at, finished_at, pushed, pulled, failed, decisions_json}`; failures > threshold (3 consecutive) page the shelter admin via email + dashboard banner, and emit `sync.run_failed` webhook.
- Sandbox mode per target (`mode:'dry_run'`) logs intended operations without calling the provider — used by CI integration tests against recorded fixtures (VCR-style).
- Provider outages degrade silently (reconciliation heals later); user-facing flows never block on sync.
