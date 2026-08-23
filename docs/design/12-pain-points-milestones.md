# 12 — Pain-Point Report Analysis & Milestone Plan

Source: "Comprehensive Analysis of Operational Pain Points…in Animal Sheltering" (user-supplied,
2026-08). Method: every reported pain point was mapped against Kithlink's shipped surface;
solvability scored by (partial coverage × implementation cost). Prioritization rule from the
product owner: **items we already partially cover and can ship quickly go first**, plus a
dedicated, *gentle* answer to the post-adoption support vacuum.

## 1. Pain-point inventory → Kithlink mapping

| # | Reported pain point | Key stat | Kithlink today | Verdict |
| --- | --- | --- | --- | --- |
| P1 | **Post-adoption support vacuum** — 66 % of returns inside 30 d; days 1–14 peak; no structured follow-up; returns >30 d recorded as generic surrenders (data erased) | 7–15 % dog return rate; 68–70 % show transition behaviors | outbox email infra ✓ · applications pipeline ✓ · nothing post-adoption | **Flagship — build now (M5 "Settling In")** |
| P2 | **Gatekeeping friction & screener bias** — gut-feel rejections, multi-week delays, adopter drop-off | major drop-off driver | applications pipeline ✓ · notes ✓ · objective artifact evidence ✓ · no standardized decision framework | **M6 — quick win** |
| P3 | **Behavioral documentation gap** — static SAFER-style verdicts mislead; FAS snapshots misused as permanent; longitudinal logs missing | 19 % aggression reports post-placement | `traits_json`/`medical_json` flexible metadata ✓ | **M7** |
| P4 | **Foster network chaos** — informal comms, no capacity/skill visibility, off-site medical reporting by phone | core ops-suite feature | ❌ nothing | **M8** |
| P5 | **Spay/neuter backlog & compliance** — 91 % backlog, +27.5 d LOS; report recommends foster-to-adopt + voucher w/ automated compliance tracking | 73 % vet shortage | ❌ | **M9** |
| P6 | **Legacy-software rigidity** — no flexible metadata, silos, no interoperability | sector-wide | JSONB metadata everywhere ✓ · RSS/API surfaces ✓ · export planned | Partially solved; keep open APIs |
| P7 | **Workforce misallocation / SOP absence** — DVMs on admin, manager overload | 74 % RVT vacancies | ❌ | M10 (SOP/task-template library) |
| P8 | **Staff moral injury / burnout** — only 26 % support programs | 83 % report sadness | ❌ (human problem; software can only avoid adding pressure) | Design principle, not a module |
| P9 | Facility/HVAC deficiencies | physical | n/a | Non-goal |

## 2. Milestones

### M5 — "Settling In": the post-adoption journey (flagship)
Gentle, game-flavored follow-up replacing chase-calls. Principles: **opt-in feel, zero
pressure, celebrate wins, make help invisible until wanted.**

- Adoption finalization (`application → adopted`) schedules a Journey: touchpoints on
  **day 2 · 14 · 30 · 365** (anniversary card). Emails are warm, one-click, no login
  (signed journey token).
- Journey web page: pet+owner mood pickers, optional topic chips (potty, chewing,
  intros, vet, food), a win/worry note, optional photo. Submitting a concern quietly
  opens a **Case** in the shelter's queue; everything-fine shows confetti + trail
  progress (paw-print path, "Day 14 · Settling in" badge; 3-3-3 decompression tips
  embedded as micro-cards). Skipping is always one tap and never punished.
- Staff side: Journeys queue with statuses (On track · Needs attention · Silent),
  return-risk flag after repeated concerns; structured **return intake** linked to the
  original adoption so outcome data is never erased as a generic surrender.
- Tables: `adoption_journeys`, `journey_touchpoints`, `journey_responses`,
  `adoption_cases`. Scheduler rides the existing outbox cron pattern.

### M6 — Objective decisions (anti-bias quick win)
Per-shelter review checklist (configurable yes/no criteria rendered on every
application), decision templates, placement-velocity stat on dashboard. Uses existing
notes/history/artifact-provenance surface.

### M7 — Longitudinal behavior timeline
Snapshot entries (FAS 0–4 + context tags + note, author, date) on animals; explicitly
labelled "observations, not verdicts"; shown on animal detail + shared pre-adoption;
volunteer-mobile-friendly form.

### M8 — Foster network portal
Foster-home profiles (capacity, environment, skills), placements, periodic foster
check-ins **reusing the M5 touchpoint engine**, supplies/med flags → staff queue.

### M9 — Sterilization compliance tracker
Sterilization status/due dates per animal, voucher reference, reminder touchpoints
(M5 engine), shelter compliance dashboard — enables foster-to-adopt without dead kennel time.

### M10 — Enablement library
Role-based SOP/onboarding templates shipped as docs + in-app task templates; explicitly
scoped to *reduce* admin load (P7) without pretending software fixes burnout (P8).

## 3. Sequencing

| Wave | Content | Why now |
| --- | --- | --- |
| 1 | M5 (backend → UI/e2e) | Owner priority; largest measured impact; infra mostly exists |
| 2 | M6 | Partial coverage, days-not-weeks effort |
| 3 | M7 | Schema patterns exist |
| 4 | M8, M9 | Reuse M5 engine; larger surface |
| 5 | M10 | Content-heavy, low risk |

Design guardrail for M5 (from product owner): **nothing here may create stress or
obligation** — copy reviewed for warmth, skipping frictionless, concerns route privately
to humans, celebratory moments are the default emotional beat.
