# 11 — Feature Gap Analysis vs Category Baseline

Date: 2026-08-23 · Sources: Petfinder consumer UX (search filters, animal pages),
shelter-management suites (MultiOp Known-Person/Animal records, Buzz adopter profiles &
timelines, PawPlacer search/reporting, Pet Friend intake→outcome). Purpose: define the
"table stakes" for an adoption network and close the gaps.

## 1. Adopter-side baseline (Petfinder bar)

| Capability | Baseline behavior | Kithlink status | Priority |
| --- | --- | --- | --- |
| Global pet search | All-network listings w/ filters | ❌ only per-shelter lists | **P0** |
| Filters: species/sex/size/age | Standard facet set | ❌ | **P0** |
| Location + distance | "Near <city> within N mi" | ❌ no geodata at all | **P0** (needs shelter geodata) |
| Breed/text search | Typeahead + q | partial (per-shelter FTS) | P0 |
| Care & behavior facets | kids/dogs/cats ok | traits stored, unfilterable | P1 |
| Animal detail page | Full profile + photos + apply + shelter info | ❌ no dedicated page | **P0** |
| Photos everywhere | Primary photo on cards/detail | metadata-only pipeline; placeholders | P1 (upload UI) |
| Days-on-platform / newest sort | Standard | ❌ | P0 (newest) |
| Saved pets / favorites | Heart + list | ❌ | P1 |
| Email alerts on new matches | Saved-search digests | ❌ | P2 |

## 2. Shelter-side baseline (ops suites bar)

| Capability | Baseline behavior | Kithlink status | Priority |
| --- | --- | --- | --- |
| Adopter history at decision time | Prior adoptions/apps at YOUR shelter, flags | ❌ only current app | **P0** |
| Verification provenance | Who verified what, when, which org | per-artifact timeline inside active consent only | **P0** → consolidate + always show own-shelter history |
| Staff notes on records | Timelines, private notes | ❌ | **P0** |
| Intake/outcome/kennel/foster modules | Core ops suites | ❌ out of protocol scope v1 | Planned |
| Medical records depth | Vaccines/meds/timelines | medical_json free-form | Planned |
| Reporting (outcomes, LOS) | Prebuilt reports | ❌ | P1 later |
| Payments / e-sign contracts | Common add-on | non-goal v1 | Deferred |

## 3. Platform basics every service expects

| Capability | Status | Priority |
| --- | --- | --- |
| Forgot / reset password | ❌ **P0** | this pass |
| Email address verification | ❌ send-on-register + banner | **P0** (soft-gate) |
| Self-serve account export/delete | delete design exists, no endpoint | P1 |
| Notification preferences / unsubscribe | outbox exists, no prefs | P2 |

## 4. This-pass scope (P0 batch)

1. **Shelter geodata**: city/state/postalCode/latitude/longitude on shelters; admin edit;
   public exposure (city/state only + derived distance when requested).
2. **Discovery**: `GET /public/v1/animals` network-wide search (species, sex, size,
   ageClass baby|young|adult|senior, q text, shelterSlug, nearLat/nearLng/radiusKm,
   sort=newest) + web `/animals` page with filter rail + `/animals/[id]` detail page
   (JSON-LD, apply CTA, shelter card).
3. **Applicant history (secure)**: `GET /admin/v1/shelters/:sid/applications/:id/applicant-history`
   → profile summary + ALL applications at *this* shelter (any status, any era) +
   consented artifacts with FULL verification provenance (outcome, method, shelter name,
   verified_at, valid_until). UI: History card in application detail. Cross-shelter data
   remains strictly consent-scoped; own-shelter records are always shown (own legal records).
4. **Staff notes**: `application_notes` table (audited, staff-tenant scoped), list/add UI
   in review screen.
5. **Auth basics**: forgot-password (outbox email w/ single-use token, 1h TTL) +
   reset endpoint; email verification link on register (outbox), `emailVerified` surfaced,
   soft banner (no hard gate v1).

Non-goals unchanged (payments, fosters, kennels). Everything else lands on roadmap as
Planned with pointers.
