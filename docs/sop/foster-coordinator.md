# SOP — Foster Coordinator

You run the foster network end to end from **Fosters** (`/fosters`) in the
staff app: homes, placements, check-ins, and closings. Home/placement actions
use `coordinator`-level admin endpoints; foster check-ins arrive through a
public signed link — no login for the family
([M8 design](../design/12-pain-points-milestones.md#m8--foster-network-portal)).

## Cadence table

| Cadence | Task | Where |
| --- | --- | --- |
| On signup | Onboard home honestly (step 1) | `/fosters` form or API |
| As animals need placement | Match & place (step 2) | `/fosters` |
| Weekly | Review active placements + check-in updates (step 3–4) | `/fosters` tables, `GET …/placements/:id/updates` |
| Immediately on concern | Escalate (step 5) | see path below |
| On return/adoption | Close placement (step 6) | `/fosters` → Close |

## 1. Onboard a home with honest defaults

Add via the **Foster homes** form (`POST
/admin/v1/shelters/:shelterId/fosters/homes`; fields: home name 2–120 chars,
primary contact email, capacity 1–20). Record capacity and skills as they are
*today*, not aspirationally:

- `capacity`: what the home can actually take this month. Adjust later via
  `PATCH …/fosters/homes/:id`.
- `skills` (enum): `neonatal`, `post_op`, `reactive`, `medical`, `behavior` —
  only after demonstrated experience or training, never to fill the profile.
- `environment` flags (`residentPets`, `children`, `fencedYard`) shape safe
  matching — ask directly and record the answers.

An over-stated profile causes failed placements; under-stating just delays one.
Use the Active toggle (`PATCH` with `active:false`) for breaks/vacations.

## 2. Matching & placing

In the **Placements** section pick an *active* home + an animal and click
**Place** (`POST …/fosters/placements`). Match in this order:

1. Skill need vs. home skills (post_op animal → `post_op` home).
2. Environment fit (reactive dog → no resident pets / fenced yard where required).
3. Remaining capacity (`currentPlacements < capacity`).
4. Distance/practicality for medical follow-ups.

Before placing, read the animal's observation timeline on `/animals/[id]`
([intake SOP](intake-volunteer.md#3-log-behavior-observations-same-day)) and
share it with the family — snapshots, not verdicts, set fair expectations.
Placement creation sets a **next check-in** date automatically.

## 3. Weekly check-in review

Families receive a signed check-in link (`GET/POST /public/v1/foster-checkin`)
and submit notes (≤2000 chars) plus an optional concerns flag. Weekly:

1. Open `/fosters`; scan the placements table for overdue **Next check-in** dates.
2. Pull updates per placement: `GET …/placements/:id/updates` (notes, concern flag, timestamp).
3. Log your own follow-up outcome in the same channel you use with the family;
   Kithlink keeps their submissions, you keep the resolution trail.

## 4. Concern escalation path

| Signal | Action | Owner |
| --- | --- | --- |
| `concerns: true` on any update | Call the home within 24 h; triage | You |
| Medical issue | Route to vet staff; if animal has sterilization due date approaching, note it on `/animals/[id]` | Vet staff |
| Safety incident or behavior regression | Move animal status to `unavailable`, plan return intake | You + coordinator |
| Repeated concerns on one placement (return-risk pattern, cf. journeys) | Schedule in-person visit before next check-in | You |

Never let a concern wait for the weekly review — the flag exists so families
can raise things privately and early.

## 5. Closing placements

Click **Close** on the row (`POST …/placements/:id/close`) when the animal is
adopted, returned, or moved. Closing rules:

- Adoption → coordinate with the adoption coordinator so application status
  reaches `adopted` and the post-adoption journey schedules
  ([adoption-coordinator.md](adoption-coordinator.md#6-status-moves--placement-velocity)).
- Return → animal goes back on your board honestly; set status with intake
  (never re-enter as a new animal).
- Update home capacity/skills afterward if the placement revealed anything
  (e.g. add `reactive` after a successful reactive-dog stint).

See also: [Shelter Admin Guide](../guide/shelter-admin.md),
[onboarding-checklists.md](onboarding-checklists.md).
