# 07 — Security & Privacy

## 1. Threat Model (STRIDE, abridged)

| Threat | Vector | Mitigation |
| --- | --- | --- |
| **S**poofing: staff account takeover | Credential stuffing | Argon2id + breach-password denylist + lockout backoff; TOTP for owner/admin; session bound to UA hash |
| **T**ampering: forged sync callbacks | Fake Petfinder webhook | HMAC signature + timestamp window + provider IP allow-list where published |
| **R**epudiation: "shelter saw my lease?" | — | Hash-chained audit log of every artifact access (actor, consent id, purpose); applicant-visible access history |
| **I**nformation disclosure: LLM leakage | Sensitive text to third-party model | Deterministic pre-redaction (doc 04 §5); raw files never leave storage; zero-retention provider terms; self-host disclosure gate |
| **D**enial: presign abuse | Mass URL minting | 20/min/user bucket; one-time nonces; artifact presign TTL ≤120 s |
| **E**levation: cross-tenant read | Missing WHERE clause | RLS backstop + CI test asserting policies on every PII table; cross-tenant e2e pen-test case each release |
| Insider abuse (managed cloud ops) | Operator reads artifacts | No KEK access by default; break-glass = dual control + customer notification |

## 2. Consent Architecture

```
Applicant ──grants──► ConsentGrant(scope=application_review, shelter=B, expires=T+90d)
                          ├─► API guard check        (fast path)
                          ├─► Service tx re-check    (authoritative)
                          ├─► Postgres RLS           (backstop)
                          └─► Presign issuance check (bytes layer)
Revocation → status='revoked': guard/RLS/presign fail immediately;
             outstanding URLs die naturally (≤120 s); file-deletion scheduler armed
```

Applicant dashboard shows a live "Who can see what" matrix (shelter × scope × expiry) with revoke buttons. Revocation cuts *document access*; application records shelters must keep for their own legal purposes are retained as metadata only.

## 3. PII Classification & Handling

| Class | Examples | Handling |
| --- | --- | --- |
| P0 secret | passwords, TOTP secrets, KEK/DEKs | Argon2id / AES-GCM sealed; never logged |
| P1 sensitive | `address_enc`, artifact bytes, sync credentials | Envelope encryption; audited access; consent-gated |
| P2 personal | email, phone, name | TLS; least privilege; erasable via crypto-shred |
| P3 operational | animal records, site content | Public by design |

Logging: structured logs pass a field-level scrubber (`PII_KEYS` exported from contracts package); P0/P1 keys cannot serialize (Zod `toJSON` redactors).

## 4. Application Security Practices

- Supply chain: Renovate + `pnpm audit` + CI `osv-scanner`; distroless non-root images pinned by digest.
- SAST/secrets: Semgrep + gitleaks in CI and pre-commit.
- Upload hardening: MIME sniff vs extension, rasterize-before-parse, ClamAV hook, size caps.
- Headers: HSTS, nonce-based CSP, `Permissions-Policy: camera=(self)`, XCTO.
- Rate limits + Turnstile CAPTCHA after 3 failed logins.

## 5. Compliance Mapping

| Regime | Approach |
| --- | --- |
| State privacy laws (CCPA/CPA…) | Self-serve export/delete for applicants; signup disclosures; no data sale — affiliate links are contextual, no profile transfer |
| FCRA-adjacency | Kithlink issues no consumer reports; verifications are factual document attestations with named human verifier — legal review before GA |
| COPPA | Household children stored as age bands only, never names/DOB |
| Shelter records law | Audit log retention 7 y supports municipal animal-control record obligations |

## 6. Audit Log (hash chain)

Append-only `audit_logs(id, actor, shelter_id, action, entity_type, entity_id, meta_json, prev_hash, hash)` where `hash = SHA256(prev_hash || canonical(row))`. Nightly anchor job stores checkpoint hash externally (managed cloud: object-lock bucket). Tamper evidence without blockchain overhead.

Audited actions (minimum): artifact file view/download, verification create/update, consent grant/revoke, application status change, staff/role change, sync credential change, export/delete requests.

## 7. Incident Response

Severity ladder SEV1–4 with runbooks in `docs/runbooks/` (data breach, storage exposure, LLM provider outage, sync provider outage). Breach playbook follows state notification timelines (most ≤30 d); applicant notifications include exactly which artifacts were exposed and revocation status. Quarterly restore drill from backups (see doc 08 §6).
