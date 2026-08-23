# Kithlink Themes

Shelter site themes render through the theme SDK (`docs/design/06-sites-*`).
Everything in this directory is licensed **MIT** — see `LICENSE-MIT` — unlike
the AGPLv3 core (see the root `COPYING.md`). Use them commercially, fork them,
ship them to clients.

Planned layout:

- `default/` — reference theme ×2 variants (light + shelter-branded)
- Theme SDK types are published from `packages/contracts`; themes never import
  server modules directly.
