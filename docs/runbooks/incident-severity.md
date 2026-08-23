# Incident Severity & Paging

Applies to managed cloud (CivicHearth) and, by convention, to serious
self-host escalations reported upstream.

## Severity ladder

| SEV | Definition | Examples | Initial response | Update cadence |
| --- | --- | --- | --- | --- |
| **SEV1** | Platform down or tenant data exposed/lost; no workaround | API 5xx > 50% for 5 min; RLS bypass confirmed; master-key leak; artifact store exposure | Page on-call immediately (phone + Slack `#inc-<id>`), incident commander assigned ≤ 15 min | Every 30 min |
| **SEV2** | Core journey badly degraded, workaround exists | Logins failing for one auth path; sync pushes stuck > 1 h; uploads broken site-wide | Page on-call during waking hours (≤ 15 min ack) | Every 2 h |
| **SEV3** | Non-core feature impaired, limited blast radius | One shelter's site publish failing; email outbox delayed; OCR queue backlog | Slack `#ops` ticket, business hours | Daily |
| **SEV4** | Cosmetic / no user impact | Stale metrics dashboard; flaky e2e test on main | GitHub issue tagged `incident` | On triage |

## Paging rules

- Alerts auto-page for: healthz failures ×3 probes, SLO burn rate > 10× over
  1 h, DLQ depth > 100, backup job failure.
- On-call rotation: weekly, primary + secondary, handover Monday 10:00 local.
- Escalation: primary unacked 10 min → secondary; 20 min → engineering lead;
  SEV1 unresolved 1 h → CTO/board liaison.

## Roles

| Role | Responsibility |
| --- | --- |
| Incident Commander (IC) | Owns decisions + comms; does not hands-on-keyboard |
| Ops lead | Mitigation, rollbacks, infra |
| Comms scribe | Status page, shelter notifications, timeline log |

## Lifecycle

1. **Detect** (alert or report) → open `#inc-<yyyymmdd-n>`, declare SEV.
2. **Mitigate** first (rollback, feature flag off, drain queue); root cause later.
3. **Resolve** — monitors green for 30 min (SEV1/2) before closing.
4. **Postmortem** — blameless doc within **5 business days** for SEV1/2;
   action items tracked to closure. Audit-relevant incidents append a note via
   the audit chain per `docs/design/07-security-privacy.md` §7.
