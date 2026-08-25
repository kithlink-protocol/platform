# 13 — Universal Application & Shared Verification Data

## Problem
Every shelter asks nearly identical questions but makes applicants re-enter them.
Verification of rental terms is repeated redundantly across shelters.

## Solution
1. **Universal Application Profile** — structured JSONB on applicant_profiles covering
   every section found in real shelter applications (researched from NCSPCA, Lifelong
   Friends, GSRRC, Jotform's 25-question guide). Filled once, updated when life changes,
   visible to reviewing shelters via consent.
2. **Rental Property Registry** — crowdsourced table of rental properties + their pet
   policies. When an applicant enters an address that matches a known property, the policy
   auto-populates. Other applicants at the same property can confirm or correct it.
   Reduces redundant landlord verification calls.

## Schema additions

```sql
-- On applicant_profiles (new JSONB column):
universal_application jsonb NOT NULL DEFAULT '{}'

-- New table:
rental_properties (
  id uuid PK,
  normalized_name text NOT NULL,     -- lowercase, trimmed, for matching
  display_name text NOT NULL,
  address_text text,
  city text, state text, postal_code text,
  latitude float8, longitude float8,
  pet_policy jsonb DEFAULT '{}',     -- {allowed, maxPets, deposit, monthlyRent, breedRestrictions[], weightLimit, notes}
  submitted_by uuid REFERENCES users,
  confirmed_count int DEFAULT 0,
  denied_count int DEFAULT 0,
  created_at timestamptz,
  UNIQUE(normalized_name, city, state)
)
```

## Matching strategy
When an applicant types a property name + city, we normalize (lowercase, trim) and
fuzzy-match against existing entries. If match score > threshold → auto-fill pet policy.
Applicant confirms or edits. Each confirmation increments confirmed_count; corrections
increment denied_count. Properties with high confirmation counts become "trusted."
