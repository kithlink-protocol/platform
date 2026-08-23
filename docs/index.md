# Kithlink Documentation

![Kithlink home, dark mode](assets/web-home-dark.png)

Kithlink is a pet-adoption platform with reusable applicant profiles,
consent-gated document sharing, shelter dashboards, self-serve shelter
websites, and listing syndication.

## Guides

### For adopters (Applicant)

- [Applicant Guide](guide/applicants.md) — create an account, build your reusable
  profile, upload verification documents, apply to animals, and manage who can
  see your data.
  Covers `/register`, `/profile`, `/artifacts`, `/shelters`, `/apply/[animalId]`,
  and `/applications`.

### For shelter staff (Shelter staff / Shelter admin)

- [Shelter Staff Guide](guide/shelter-staff.md) — day-to-day dashboard work:
  reviewing applications, verifying applicant artifacts, and the animal status
  lifecycle. Covers the admin app at `http://localhost:3001` in dev
  (`/`, `/dashboard`, `/applications`).
- [Shelter Admin Guide](guide/shelter-admin.md) — administration: staff roles
  and capabilities matrix, publishing your public website (`/site`),
  Petfinder syndication (`/sync`), and the RSS fallback feed.

### For operators

- [Deployment Guide](deploy/overview.md) — compare deployment options and walk
  through a production self-host end to end (host → Docker → secrets →
  migrations → first shelter → TLS → health checks → upgrades).
- [Self-hosting reference](self-hosting.md) — detailed environment-variable
  matrix, Caddy TLS snippet, backup script, and upgrade procedure. The
  Deployment Guide links here instead of repeating it.
- Runbooks: [docs/runbooks/](runbooks/) — incident severity, data-breach
  playbook, restore drill.

### For contributors (Contributor)

- [README quickstart](../README.md) — local dev setup in five commands
  (compose up, migrate, seed, `pnpm dev`).
- [TECH_DESIGN.md](../TECH_DESIGN.md) — high-level product and system design.
- Engineering design docs: [docs/design/](design/)
  - [01 Architecture](design/01-architecture.md)
  - [02 Data model & RLS](design/02-data-model.md)
  - [03 API & RBAC](design/03-api.md) — source of the staff role matrix
  - [04 Verification engine](design/04-verification-engine.md)
  - [05 Sync integrations](design/05-sync-integrations.md)
  - [06 CMS / site generator](design/06-cms-site-generator.md)
  - [07 Security & privacy](design/07-security-privacy.md)
  - [08 Deployment & ops](design/08-deployment-ops.md)
  - [09 Roadmap](design/09-roadmap.md)

### Reference

- [Troubleshooting](guide/troubleshooting.md) — login loops, site publish 404s,
  sync dry-run confusion, cookie/RLS errors, migration recovery, rate limits.
- [SECURITY.md](../SECURITY.md) — how to report vulnerabilities.

## Audiences at a glance

| Audience | Start here |
| --- | --- |
| Applicant (adopter) | [Applicant Guide](guide/applicants.md) |
| Shelter staff | [Shelter Staff Guide](guide/shelter-staff.md) |
| Shelter admin | [Shelter Admin Guide](guide/shelter-admin.md) |
| Self-hoster | [Deployment Guide](deploy/overview.md) then [Self-hosting](self-hosting.md) |
| Contributor | [README quickstart](../README.md) + [TECH_DESIGN.md](../TECH_DESIGN.md) |

## App surfaces

| Surface | Dev URL | Who uses it |
| --- | --- | --- |
| Applicant web app | `http://localhost:3000` | Adopters |
| Staff/admin app | `http://localhost:3001` | Volunteers, coordinators, admins, owners |
| API | `http://localhost:4000` | Backing service for both apps; public registry + published sites |

## Suggested reading order

1. **Adopter?** Read the [Applicant Guide](guide/applicants.md) top to bottom —
   it covers account → profile → documents → applying in order.
2. **New staff member?** [Shelter Staff Guide](guide/shelter-staff.md), then
   ask your admin for the role listed in the capability matrix.
3. **Setting up a shelter's website or Petfinder feed?**
   [Shelter Admin Guide](guide/shelter-admin.md).
4. **Running your own instance?** [Deployment Guide](deploy/overview.md) for
   the walkthrough; keep [Self-hosting](self-hosting.md) and
   [Troubleshooting](guide/troubleshooting.md) bookmarked.
5. **Contributing code?** README quickstart first, then the
   [design docs](design/) — especially
   [02 Data model & RLS](design/02-data-model.md) and
   [03 API & RBAC](design/03-api.md), which the guides deliberately summarize
   rather than duplicate.
