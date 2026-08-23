# 06 — Headless CMS & Site Generator

Goal (G3): shelter launches an accessible public website in <15 minutes; inventory edits propagate to site + Petfinder within 60 s.

## 1. Concepts

| Concept | Storage | Notes |
| --- | --- | --- |
| **Site** | `sites` row per shelter | theme slug, brand tokens (logo, colors), nav config, SEO defaults |
| **Page content** | `site_pages` (JSON blocks) | Block-based editor: hero, animal-grid, about, faq, contact, custom-html(sanitized) |
| **Theme** | Code in `/themes` repo dir | MIT-licensed React components + Tailwind preset implementing the Theme SDK contract |
| **Animal content** | Live query at render time | Never duplicated into CMS; the *only* source is `animals` |
| **Custom domain** | `custom_domains` row + DNS verify | CNAME → sites CDN; auto HTTPS via ACME |

## 2. Rendering Pipeline

```
inventory/CMS change ──► domain event ──► queue: site.render (shelterId)
   renderer worker:
     1. load Site + pages + visible animals
     2. render Next.js route tree → static HTML/CSS/JS + JSON data files
        (per-animal detail page, sitemap.xml, robots.txt)
     3. upload bundle to bucket under  sites/<shelterId>/<buildId>/
     4. atomically flip pointer object sites/<shelterId>/current  → buildId
     5. CDN purge (tag-based: shelter:<id>) ; mark site.published_at
```

Properties:

- **Atomic publishes** — pointer flip means no torn reads; rollback = re-point to previous buildId.
- **Budgets:** full build ≤ 20 s for ≤500 animals (incremental page rendering if exceeded); end-to-end p95 publish ≤ 60 s.
- **Live-ish data:** animal availability badge hydrates client-side from `/public/v1/...` with 60 s cache — so "pending/adopted" flips don't wait on a rebuild.

## 3. Theme SDK (`packages/theme-sdk`, MIT)

```ts
export interface KithlinkTheme {
  meta: { name: string; version: string; screenshots: string[] };
  blocks: Record<BlockType, React.ComponentType<BlockProps>>;
  layout: React.ComponentType<SiteLayoutProps>;   // nav/footer/a11y landmarks
  tokens?: Partial<TailwindTokenOverride>;
}
```

- Themes receive **typed block props only** — no direct DB/API access — guaranteeing any theme works for any tenant and cannot leak applicant data.
- A11y bar for a theme to ship in-tree: WCAG 2.1 AA automated checks (axe) + keyboard nav test + contrast tokens enforced by lint.

## 4. Editor UX (Admin Dashboard)

- WYSIWYG block editor with live preview rendered from the same theme components (no iframe fake-preview divergence).
- One-click flow: pick subdomain → pick theme → import logo → edit hero text → publish. Timeboxed to <15 min.
- Draft vs published states per page; scheduled publishing via delayed BullMQ job.
- Custom domain wizard: DNS TXT verification → ACME cert issuance (managed cloud); self-hosters get Caddy-onboarding docs.

## 5. Security Notes

- `custom-html` block sanitized server-side (allow-list sanitizer) and rendered sandboxed.
- Public site bundles contain **zero** applicant/staff data by construction (theme props are inventory-only).
- CSP headers on sites CDN: `default-src 'self'`; scripts pinned by integrity hash generated at build.
