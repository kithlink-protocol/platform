# Data Breach Playbook

Read alongside `incident-severity.md` (SEV ladder) and
`docs/design/07-security-privacy.md` (PII classes, consent, audit chain).

## 0. Classify first

A "breach" is any confirmed unauthorized access, exfiltration, alteration, or
loss of personal data: applicant identities/addresses, artifact documents,
session tokens, staff credentials, audit chain.

## 1. Contain (target ≤ 1 h from declaration)

| Step | Action |
| --- | --- |
| C1 | Revoke compromised sessions (`delete from sessions where ...` as owner) and rotate the affected credentials/API keys |
| C2 | Block attacker path: WAF/IP rule, disable feature flag, or take affected service out of rotation |
| C3 | Snapshot forensics **before** mutating state: preserve logs, `pg_dump` of affected tables, object-store version listing; hash and store evidence read-only |
| C4 | If storage keys may be copied: rotate `KITHLINK_MASTER_KEY` per §4 below |

Never delete data during containment — quarantine instead.

## 2. Assess scope

- Which PII classes (doc07 §3)? Addresses are envelope-encrypted
  (`address_enc`) with a key derived per deployment; artifacts encrypted at rest.
- Which shelters/applicants? Query via owner role; record counts + time window.
- Was ciphertext taken *with* key access (worst case), or ciphertext only
  (mitigated — see §4)?

## 3. Notify

| Regime | Clock | Who |
| --- | --- | --- |
| GDPR (EU subjects) | **≤ 72 h** to supervisory authority; without undue delay to subjects if high risk | DPO / IC |
| US state laws (all 50 have statutes by 2026) | Most states: "without unreasonable delay", commonly ≤ 30 days statutory outer bounds; some (e.g. CO 30d, FL 30d, WA 30d) stricter; AG notification above thresholds | Legal counsel |
| Canada PIPEDA | As soon as feasible + record kept 24 mo | Privacy officer |
| Contractual | Managed-cloud shelter agreements require notice within 48 h of confirmation | Account owners |

Notification content: what happened, data categories, time window, steps we
took, remediation for individuals (credit monitoring when IDs/documents were in
scope), contact channel. Shelters notify *their* applicants using our template;
we provide the draft.

## 4. Crypto-shred implications

Artifact files and `address_enc` columns are envelope-encrypted under
`KITHLINK_MASTER_KEY`.

- **Ciphertext-only theft** is largely neutralized if we rotate the master key
  promptly: old objects become unreadable to the attacker. Rotation procedure:
  generate new key → re-wrap data encryption keys (KEK/DEK split) → verify
  decrypt of a sample → decommission old KEK. Old ciphertext never needs
  rewriting, which is precisely why the design uses envelope encryption.
- **Key + ciphertext theft**: rotation does not help retroactively. Treat as
  disclosed plaintext: individual notification is mandatory; offer credit
  monitoring; expect regulator scrutiny.
- Self-hosters hold their own master key; breach support includes a signed
  advisory with exact rotation SQL/steps.

## 5. Eradicate & recover

Root cause fixed and verified on staging → restore any quarantined data →
re-enable features progressively → monitors green 24 h before downgrade.

## 6. Postmortem (≤ 5 business days)

Blameless doc: timeline, scope tables, regulator/notification receipts, control
gaps, dated action items. Append an incident-summary row to the audit chain so
shelter admins retain an immutable record of what happened to their tenants'
data.
