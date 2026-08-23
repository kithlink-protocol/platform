# Security Policy

## Supported versions

| Version | Status | Security fixes until |
| --- | --- | --- |
| 1.0.x (GA) | Supported | 12 months after each minor release |
| < 1.0 | Not supported — upgrade | n/a |

Self-hosters should track `main` or the latest tagged release; patches land as
regular releases with a `security:` prefix in the changelog.

## Reporting a vulnerability

Email **security@kithlink.org** (responsible disclosure, no bug bounty yet).

- Acknowledgement target: **48 hours**
- Triage + severity assignment (SEV ladder, see `docs/runbooks/incident-severity.md`): **5 business days**
- Fix target: critical ≤ 7 days, high ≤ 30 days, medium/next release
- Coordinated disclosure window: **90 days**, earlier by mutual agreement

PGP key: *placeholder — fingerprint to be published before GA launch; until
then email is accepted unencrypted but please avoid including secrets.*

Please include: affected component(s), reproduction steps or PoC, impact
assessment, and whether you want credit. Do not open public GitHub issues for
vulnerabilities.

## Scope

In scope: `apps/server`, `apps/web`, `apps/admin`, workers, `packages/*`,
Compose/Helm deployment defaults, site renderer XSS, RLS bypass, artifact
encryption, auth/session handling.

Out of scope: volumetric DoS against managed cloud (use the rate limits
responsibly), social engineering of shelter staff, reports from automated
scanners without demonstrated impact.

## Safe harbor

We will not pursue legal action against good-faith research that respects user
data, avoids service degradation, and follows this policy.
