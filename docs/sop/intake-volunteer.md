# SOP — Intake Volunteer

You create and maintain animal profiles so coordinators, adopters, and
syndication feeds always see accurate inventory. Creating/editing animals is
currently done through the admin API — the dashboard table is read-only (see
[Shelter Staff Guide](../guide/shelter-staff.md#animals-and-their-statuses)).
Requires `volunteer` role or above.

## Daily rhythm

| When | Task | Where |
| --- | --- | --- |
| Shift start | Scan `/dashboard` animals table for wrong statuses | `/dashboard` |
| At intake | Create animal record (step 1) | API |
| Same day | Photo with alt text (step 2), behavior observation (step 3) | API, `/animals/[id]` |
| Before shift end | Sterilization status set honestly (step 4) | `/animals/[id]` |
| On any change | Update status lifecycle (step 5) | API |

## Weekly rhythm

1. Pick 5 random animals you entered; re-check species/sex/birth year/size against paperwork.
2. Review `GET /admin/v1/shelters/:shelterId/sterilization/summary` for overdue `scheduled` items; chase due dates.

## 1. Add an animal (intake)

`POST /admin/v1/shelters/:shelterId/animals`. These fields drive search,
age buckets, and syndication — get them right:

| Field | Why it matters | Discipline |
| --- | --- | --- |
| `species` (`dog`/`cat`/`other`) | Public registry + Petfinder filtering | Never guess; verify |
| `sex` (`male`/`female`/`unknown`) | Adopter filters | Use `unknown`, never a guess |
| `birthYear` | Derives age class: <1y baby, 1–2 young, 3–7 adult, 8+ senior | Estimate from teeth if needed; update when vet dates it |
| `size` (`small`…`xl`) | Housing fit, filters | Leave null until weighed/measured |
| `description` | RSS feed + public page copy | Facts and observed behavior only |

Create in `status: draft`.

## 2. Photo hygiene

Attach via `POST /admin/v1/shelters/:shelterId/animals/:id/photos`
(presigned-upload flow). **Always send `altText`** (≤500 chars): describe what
is visibly true ("brown terrier mix lying on a blanket"), not "dog photo".
Screen-reader users and SEO both depend on it. One clear, well-lit photo beats
five blurry ones; add more later rather than delaying publication.

## 3. Log behavior observations same-day

Open `/animals/[id]` → **Add observation** (endpoint:
`POST …/animals/:id/observations`). The screen says it best:
*observations are snapshots in time — not verdicts.*

1. Record FAS stress score 0–4 (0 Relaxed → 4 Very stressed) for *this moment*.
2. Tag up to 4 from: playful, fearful, reactive, calm, curious, vocal, snuggly, independent.
3. Note what you literally saw ("startled at door slam, retreated under bench"),
   ≤1000 chars. No conclusions like "aggressive" — snapshots, not verdicts.
4. Log the day it happened; stale observations mislead adopters and fosters.

## 4. Sterilization status hygiene

Same animal page, **Sterilization** card (saved via `PATCH …/animals/:id`,
body `{ sterilization: { status, dueDate, voucherRef } }`):

- Intake default is `unknown`. That is honest — leave it until a vet has spoken.
- The moment surgery is booked: `scheduled` **plus a real `dueDate`**. A
  scheduled entry without a date is invisible to compliance review.
- After surgery: `completed`. If a voucher was issued: `voucher_issued` +
  voucher reference (e.g. `VCH-2026-0042`).
- Weekly summary check: overdue `scheduled` items are your escalation to the
  coordinator.

## 5. Status lifecycle

Move via `PATCH …/animals/:id`:

| Status | Meaning | Public? |
| --- | --- | --- |
| `draft` | Profile incomplete | No |
| `available` | Accepting applications — Apply button appears | Yes: registry, site, RSS, sync |
| `pending` | Application in progress | Not listed as available |
| `adopted` / `unavailable` | Homed / off-list | Shown as adopted / hidden |

Flip `draft → available` only when steps 1–3 are done. Set `pending` when the
coordinator tells you an application is moving; back to `available` if it dies.

See also: [adoption-coordinator.md](adoption-coordinator.md),
[foster-coordinator.md](foster-coordinator.md),
[onboarding-checklists.md](onboarding-checklists.md).
