# Kithlink licensing

## Split

| Scope | License | Rationale |
| --- | --- | --- |
| Core repo (`apps/`, `packages/`, `docs/`, `deploy/`, `scripts/`) | **AGPLv3** (`LICENSE`, `AGPL-3.0-or-later`) | Keeps every improvement to the platform — including hosted forks — flowing back to shelters. Network use triggers source obligations (§13). |
| `themes/` directory | **MIT** (`themes/LICENSE-MIT`) | Lowers adoption friction for designers/agencies building shelter site themes; themes are presentation-layer only and carry no tenancy logic. |

## What this means in practice

- **You self-host Kithlink**: no obligation until you offer it over a network;
  once you do, you must make your modified source available to that network's
  users under AGPLv3.
- **You build a theme**: do whatever you want, including commercially, provided
  the MIT copyright notice travels with it.
- **You contribute code**: contributions to core land under AGPLv3, to
  `themes/` under MIT. We use a DCO sign-off (`git commit -s`); there is no CLA.
- **Client SDKs / templates extracted from core** may be relicensed MIT by a
  future decision; today they inherit AGPLv3 until published separately.

## Third-party notices

Dependencies remain under their own licenses; run `pnpm dlx license-checker`
(or your SBOM tool of choice) before redistribution. Nothing in this repository
grants trademark rights to the "Kithlink" name or logos.
