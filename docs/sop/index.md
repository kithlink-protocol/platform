# Standard Operating Procedures & Onboarding

Kithlink's role-based SOP library, answering pain-point **P7** from
[12 — Pain-Point Report Analysis](../design/12-pain-points-milestones.md):
workforce misallocation and SOP absence ("DVMs on admin, manager overload").
Each file defines who does what, on which screen or endpoint, at which cadence —
so skilled staff stop absorbing admin work by default.

Every step references real Kithlink surfaces (screens in the staff app,
`/admin/v1/…` endpoints) — nothing here assumes unshipped features.

## The library

| Role | File | Time-to-productive target | Covers |
| --- | --- | --- | --- |
| Intake volunteer | [intake-volunteer.md](intake-volunteer.md) | 2 shifts | Animal intake, photos, status lifecycle, behavior observations, sterilization hygiene |
| Adoption coordinator | [adoption-coordinator.md](adoption-coordinator.md) | 1 week | Application triage, review checklist, verification decision tree, notes discipline |
| Foster coordinator | [foster-coordinator.md](foster-coordinator.md) | 1 week | Foster homes & placements, check-in review, concern escalation, closing placements |

Printable 30/60/90-day ramp plans per role live in
[onboarding-checklists.md](onboarding-checklists.md).

## Prerequisites (all roles)

1. Your admin adds you via `POST /admin/v1/shelters/:shelterId/staff-members`
   (by email; default role `volunteer`) — see the
   [capability matrix](../guide/shelter-admin.md#staff-roles).
2. Sign in at the staff app root `/` with email + password
   ([Shelter Staff Guide](../guide/shelter-staff.md#sign-in)).
3. Bookmark your shelter's dashboard `/dashboard` — every workflow below starts there.

## Adapting per shelter

The library fixes the *sequence*; you customize the *content*:

- **Review checklist** — coordinators should agree on up to 12 yes/no labels and
  set them once via `PUT /admin/v1/shelters/:shelterId/review-checklist`
  (see [adoption-coordinator.md](adoption-coordinator.md)).
- **Sterilization SLA** — pick a default due-date window for
  `unknown → scheduled` transitions (e.g. 30 days).
- **Foster capacity policy** — decide whether `capacity` counts adults only.
- **Escalation contacts** — name who receives foster concerns raised via the
  check-in form before your first placement goes out.

Add shelter-specific appendices as separate files; do not edit the role files'
numbered steps locally, so updates to this library stay mergeable.
