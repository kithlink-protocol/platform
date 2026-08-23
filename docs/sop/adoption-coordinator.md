# SOP — Adoption Coordinator

You turn applications into safe, fast placements. All triage and decisions
happen in **Applications** (`/applications`) from the dashboard; status changes
and verifications require `coordinator` role or above (capability matrix:
[Shelter Admin Guide](../guide/shelter-admin.md#staff-roles)). Workflow
background: [Shelter Staff Guide](../guide/shelter-staff.md).

## Daily rhythm

| Cadence | Task | Where |
| --- | --- | --- |
| Daily, AM | Triage queue oldest-first (step 1) | `/applications` |
| Per application | Checklist → history → verify (steps 2–4) | `/applications/[id]` |
| Daily, PM | Notes on every touched case (step 5) | `/applications/[id]` |
| Weekly | Velocity self-review (step 6) | `GET …/stats` |
| On finalization | Confirm animal set to `adopted`; journey auto-schedules | Journeys |

## 1. Triage order: oldest first

Open `/applications` — the table lists Animal / Status / Submitted. Work
strictly oldest-`submitted` first within your shelter; delay is the top driver
of adopter drop-off. Open the detail at `/applications/[id]`.

## 2. Use the objective review checklist

Each application has a **Review checklist** card (`GET/PUT
…/applications/:id/checklist`). Tick items as you verify them — it forces
criteria-based decisions over gut feel (anti-bias pain point P2). Your shelter
configures the labels once via
`PUT /admin/v1/shelters/:shelterId/review-checklist` (max 12 yes/no items).
Decide only when every applicable box is resolved.

## 3. Review the history card before deciding

The **History** card shows all past applications this person made to *your*
shelter (any status) plus verification provenance for shared artifacts (which
shelter verified what, when, until when). Check it **before** any status move —
a prior adoption or a fresh network verification often changes your next step.

## 4. Verification decision tree

Artifact cards offer three actions (`POST
…/artifacts/:artifactId/verifications`). Walk the tree:

```
Document shows "network verified" badge AND we have no own confirmation?
  → Accept prior verification (no re-call).
Any pet-policy document AND no network confirmation?
  → Call landlord.
      Policy confirmed?        → Confirm landlord call (+ summary note, validUntil if offered).
      Contradiction/mismatch?  → Mark discrepancy + note exactly what mismatched.
Details don't match anything you can resolve?
  → Move status to info_requested; ask the applicant; return to in_review when answered.
```

Consent gates everything: revoked/expired consent cuts artifact access;
terminal outcomes fix expiry 90 days out.

## 5. Notes discipline: facts > feelings

Notes are internal-only and audited ([Notes](../guide/shelter-staff.md#notes),
`POST …/applications/:id/notes`). Write what a stranger could act on:

- Good: "Landlord stated 2-pet limit, $300 deposit; lease §4 confirms."
- Avoid: "Seemed flaky on the phone."

Verification notes are redacted before storage — no names of third parties.

## 6. Status moves & placement velocity

Transitions (`PATCH …/applications/:id/status`, optional `note`, 1–2000 chars):
`submitted → in_review/denied/withdrawn`; `in_review → info_requested/approved/denied`;
`info_requested → in_review/denied/withdrawn`; `approved → adopted`;
denied/withdrawn/adopted/expired are terminal. Weekly, pull
`GET /admin/v1/shelters/:shelterId/stats`: `avgPlacementHours30d`,
`openApplications`, `animalsAvailable`. If median time-to-decision grows,
find the stalled stage — usually unverified artifacts or missing info requests.
On `approved → adopted`, tell intake to flip the animal to `adopted`
(`draft→available→pending→adopted` lifecycle:
[intake-volunteer.md](intake-volunteer.md#5-status-lifecycle)); Kithlink then
auto-schedules the post-adoption journey (days 2/14/30 + anniversary).

See also: [foster-coordinator.md](foster-coordinator.md),
[onboarding-checklists.md](onboarding-checklists.md).
