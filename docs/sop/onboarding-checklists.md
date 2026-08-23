# Onboarding Checklists — 30/60/90 Days

Printable ramp plans per role. Each item maps to a step in the role's SOP or a
guide section, so new staff verify against the real system, not memory. Roles
and capabilities: [Shelter Admin Guide §Staff roles](../guide/shelter-admin.md#staff-roles).

How to use: check items as completed; the 30-day block is the minimum for
solo work, 60/90 build fluency and shelter-specific judgment.

## Intake volunteer

| Day | Items |
| --- | --- |
| **30** | ☐ Sign in; navigate `/dashboard` ([staff guide](../guide/shelter-staff.md#dashboard)) ☐ Create one animal in `draft` with all search fields honest ([SOP step 1](intake-volunteer.md#1-add-an-animal-intake)) ☐ Attach photo **with alt text** (step 2) ☐ Log 5 same-day observations with FAS + tags (step 3) ☐ Explain all four sterilization statuses (step 4) |
| **60** | ☐ Run intake solo end-to-end (create → photo → observation → `available`) ☐ Weekly sterilization summary review done twice unaided (step on weekly rhythm) ☐ Correctly flipped an animal to `pending` and back (step 5) ☐ Zero guessed fields found in spot-check |
| **90** | ☐ Train one newer volunteer through steps 1–3 ☐ Proposed one description-writing improvement adopted by the team ☐ Can state which statuses publish where, from memory |

## Adoption coordinator

| Day | Items |
| --- | --- |
| **30** | ☐ Triage queue oldest-first for two weeks straight ([SOP step 1](adoption-coordinator.md#1-triage-order-oldest-first)) ☐ Used review checklist on every decision (step 2) ☐ Checked history card before each status move (step 3) ☐ Executed each verification action once correctly (step 4) ☐ Notes reviewed by mentor: facts only (step 5) |
| **60** | ☐ Ran one full `info_requested → in_review` loop ☐ Handled an approved→adopted finalization incl. animal status handoff (step 6) ☐ Reviewed own `avgPlacementHours30d` vs. team target ☐ Configured/refined ≥1 checklist label via `PUT …/review-checklist` |
| **90** | ☐ Owns triage queue without escalation ☐ Can reconstruct any past decision from audit trail + notes ☐ Mentored another coordinator through the decision tree |

## Foster coordinator

| Day | Items |
| --- | --- |
| **30** | ☐ Onboarded 2 homes with honest capacity/skills/environment ([SOP step 1](foster-coordinator.md#1-onboard-a-home-with-honest-defaults)) ☐ Created and closed one placement (steps 2, 6) ☐ Completed two weekly check-in reviews incl. updates pull (step 3) ☐ Can recite the escalation path (step 5) |
| **60** | ☐ Managed ≥5 concurrent active placements without missed check-ins ☐ Handled one concern flag start-to-resolution within 24 h ☐ Re-matched a failed placement using skills/environment fit ☐ Adjusted a home profile after placement learnings (step 6) |
| **90** | ☐ Full network run independently incl. vacation/inactive handling ☐ One retention improvement proposed from check-in patterns ☐ Cross-trained adoption coordinator on foster-to-adopt flow |

## Shelter admin sign-off

After each milestone, an admin confirms role assignment still matches actual
duties (`PATCH …/staff-members/:userId`) — P7's core fix is people doing
skilled work, not admin. See [SOP index](index.md#adapting-per-shelter).
