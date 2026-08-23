# 10 — Visual Design System

Status: normative for all Kithlink surfaces (web PWA, admin dashboard, generated shelter sites).
Stack decision: **token-based hand-rolled CSS** (no Tailwind/shadcn) — zero runtime deps,
volunteer-friendly, works identically across Next apps and the static site renderer.
This supersedes the Tailwind note in `01-architecture.md` §4; rationale: single-file
design tokens importable by the site renderer worker, which cannot run React.

## 0. Research basis (2026-08)

Sources: Vercel **Geist** design system (vercel.com/geist) + 2026 trend retrospectives.

| Signal | Decision |
| --- | --- |
| Token systems compound; dark mode = designed palette, not inversion | §1 has explicit dark values; accents desaturated in dark |
| Bento grids are the settled modular layout; hierarchy via tile size | Home features + admin dashboard use `.grid-bento` |
| Micro-interactions as feedback only; reduced-motion respect | §3 stands |
| Glassmorphism only on nav/modals | `.nav` blur stays; nowhere else |
| Kinetic type / WebGL heroes / scroll-jacking | Rejected permanently |
| Minimalism with one personality accent | Ember primary carries personality; rest is monochrome-first |
| Geist 10-step scale semantics (100 bg → 1000 text) | Token roles follow this tier logic |
| Geist fixed typography ROLES, not ad-hoc sizes | §2a role classes replace raw px scale |
| Geist restraint: "earn a surface" — spacing > borders > boxes | Cards only where grouping is real; hero gradient dropped for flat contrast band |
| Geist Sans/Mono are OFL on Google Fonts | Self-hosted via `next/font/google`; system fallbacks |

## 0a. AI readability layer

Semantic HTML everywhere; per-page title + meta description; JSON-LD `Organization` on
web home; generated sites emit `Animal` itemList + shelter `NGO` JSON-LD and ship
`llms.txt`. Headlines never live in JS/SVG/canvas.

## 1. Brand

Kithlink = warmth of the hearth + trust of the network. Visual feel: calm, competent,
community nonprofit — never corporate SaaS, never cutesy clip-art.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | #FAFAF9 | #141210 | page background |
| `--surface` | #FFFFFF | #1E1B18 | cards, tables, inputs |
| `--text` | #1C1917 | #E7E5E4 | body copy |
| `--muted` | #57534E | #A8A29E | secondary copy |
| `--border` | #E7E5E4 | #33302B | hairlines, input borders |
| `--primary` | #C2410C | #EA7B45 | primary actions, links, active nav |
| `--primary-strong` | #9A3412 | #F09A6A | hover/pressed |
| `--primary-soft` | #FEF0E7 | #3A2317 | selected rows, soft chips |
| `--accent` | #0F766E | #2DD4BF | secondary accents, info |

Semantic: `--ok` #15803D / dark #4ADE80 · `--warn` #B45309 / dark #FBBF24 ·
`--danger` #B91C1C / dark #F87171 · each with `-soft` background variant.

Dark mode via `@media (prefers-color-scheme: dark)` token overrides only — no class toggling.

## 2. Typography (roles, not sizes)

Fonts: `Geist` + `Geist_Mono` via next/font/google (variable, self-hosted), fallback
`system-ui` / `ui-monospace`. Mono ONLY for identifiers, hashes, timestamps, counts.

Role classes (fixed size/weight/leading/letter-spacing presets):

| Class | Spec | Use |
| --- | --- | --- |
| `.t-display` | clamp(2rem,4vw,2.75rem)/1.1/650/-0.02em | one per page hero |
| `.t-title` | 28px/1.15/650/-0.01em | page titles |
| `.t-heading` | 20px/1.25/650 | section turns |
| `.t-subheading` | 16px/1.35/600 | nested structure |
| `.t-lede` | 18px/1.55/400 muted | one-line orientation |
| body default | 16px/1.6/400 | reading copy |
| `.t-label` | 14px/1.2/500 | buttons, nav, compact names |
| `.t-meta` | 13px/1.4/450 muted; tabular-nums when numeric | metadata lines, table meta |
| `.t-caption` | 12px/1.4/400 muted | captions, helper text |

Rules: hierarchy through role + spacing BEFORE surfaces/borders; emphasis scarce;
equivalent peers share identical roles; fix bad line breaks with copy/measure, not font-size.

## 2a. Space & layout

Scale 4/8/12/16/24/32/48/64; within-group gap 8–16, between groups 24–32, section
turns 32–64 (never a universal stack gap). One gap owner per group (children carry no
competing margins). Containers: prose/forms 40rem, app 72rem.
`.grid-bento`: CSS grid, desktop 3-col asymmetric template (feature tile spans 2),
mobile single column; tiles = `.card`; hierarchy by span, not color.

## 3. Shape, elevation, motion

- Radius: pills 999px (badges/chips), controls 8px, cards 12px, modals 16px.
- Shadow: `--shadow-1: 0 1px 2px rgb(0 0 0 / .06)` cards; `--shadow-2: 0 8px 24px rgb(0 0 0 / .12)` overlays.
- Motion: 140ms ease-out on color/background/transform for interactive elements only;
  hover lift `translateY(-1px)` on cards-with-links; `@media (prefers-reduced-motion: reduce)`
  kills transforms/transitions.

## 4. Component inventory (class contract)

All surfaces implement these exact class names (e2e relies on roles/testids/labels, NOT classes):

- `.nav` sticky top, blurred translucent surface (`backdrop-filter`), brand wordmark left
  ("Kithlink" links `/`), links right w/ `.active` underline offset; skip-link target.
- `.btn` (+ `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger`, `[disabled]`,
  size `.btn-sm`); min-height 40px; icon-gap 8px.
- `.card` surface+radius+shadow-1+padding 20px; `.card-link` hover lift.
- `.badge` pill, 12px/600, colored by `data-status` mapping below.
- Forms: `.form-row` (label above control, gap 6px), inputs/selects/textareas share
  `.input` (surface, border, radius 8, focus ring), inline error `.field-error`.
- `.table` (admin): header muted uppercase 12px letterspaced, row hover primary-soft,
  numeric cells tabular-nums.
- `.hero`: FLAT contrast band (surface on bg, top+bottom hairline) — no gradients;
  `.t-display` + `.t-lede` + CTA row. Personality comes from type + ember accent.
- `.grid-cards`: auto-fill minmax(240px, 1fr), gap 16px.
- `.grid-bento` per §2a (home features, admin dashboard stats).
- `.empty-state`: centered muted, dashed border radius 12, padding 32.
- `.alert` variants `.alert-ok/.alert-warn/.alert-danger/.alert-info`.
- `.timeline`: left border 2px border-color, dots 8px primary, entries gap 12.
- `.stat-row` (dashboards): 3-up stat cards (value 28px/700, label muted 13px).

### Badge status mapping (single source)

| data-status | tone |
| --- | --- |
| available, verified, confirmed, active, ok | ok |
| pending, in_review, info_requested, parsing, parsed, granted | warn |
| adopted, approved | accent |
| draft, expired, withdrawn, unknown | neutral(muted) |
| denied, rejected, revoked, failed, danger, error | danger |

## 5. Page-level intent

- **Web home**: full-width hero (headline ≤2 lines, one-sentence mission, CTAs
  "Browse shelters" primary + "For shelters" ghost), then 3 feature cards
  (One profile · Verified once, trusted everywhere · Shelters in control).
- **Shelters index**: search/filter row (species select wired later OK as disabled placeholder),
  grid-cards of shelter cards (name, slug host line, available count chip).
- **Shelter detail**: header block (name + available count), grid-cards of animal cards
  (photo placeholder block with species initial when no image, name 18/650, meta line
  species·breed·sex·size, status badge, Apply button btn-primary btn-sm).
- **Auth/profile/artifacts/applications**: centered card layouts; artifacts upload uses
  dropzone-styled label over native file input; state badges everywhere.
- **Admin**: app-shell feel — same `.nav`, denser spacing, `.stat-row` on dashboard,
  tables for lists, two-column detail layout (main + aside summary card) ≥900px.
- **Generated shelter sites** (renderer): standalone CSS string in `render.ts` using the
  same tokens (inline `<style>`), hero with shelter name, animal cards grid, badge map,
  footer "Powered by Kithlink" link. No JS required.

## 6. Accessibility bar (release gate)

- Contrast ≥ 4.5:1 body / 3:1 large text & UI borders (check token pairs above — they pass).
- `:focus-visible` ring: 2px solid var(--primary), offset 2px, never removed.
- Interactive targets ≥ 40×40. Landmarks: header/nav/main/footer present.
- Icons decorative → `aria-hidden`. Status conveyed by text, not color alone (badge text
  always present).
