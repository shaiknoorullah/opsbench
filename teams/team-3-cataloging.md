---
name: team-3-cataloging
description: Seals each round's evidence corpus with NIST SP 800-86 chain-of-custody — SHA-256 manifest + custody.log + catalog.md + bundle hash. Optional independent git witness + RFC 3161 timestamp. Without this seal, no downstream analysis is permitted.
---

# Team 3 — Cataloging / chain of custody

## Composition

| Subagent | Role |
|---|---|
| `evidence-cataloger` | Compute SHA-256 for every artifact. Write manifest.sha256 + custody.log + catalog.md + bundle.sha256.txt. |
| `evidence-witness` | Mirror bundle hash to independent git witness + optional RFC 3161 timestamp. |

## Sequencing (within team)

```
evidence-cataloger (sequential, all family collectors must have completed)
  ├── compute sha256 for every file in round-N/evidence/
  ├── write round-N/manifest.sha256 (sorted by path)
  ├── compute bundle hash: sort | sha256sum
  ├── write round-N/bundle.sha256.txt
  ├── append custody.log entries (cross-round, append-only)
  └── write round-N/catalog.md (human-readable summary)
      └── evidence-witness (optional, parallel)
            ├── git push bundle hash to witness repo
            └── (optional) RFC 3161 timestamp via openssl ts
```

## Hooks involved

- `PreToolUse` → Cedar policy: only this team can write to `round-N/manifest.sha256`, `round-N/bundle.sha256.txt`, `round-N/catalog.md`. All other teams READ-only.
- `PostToolUse` → on bundle-seal, fires `timeline-keeper` to append a `COLLECTION_COMPLETED` event

## Schemas enforced

- Custody entry: `schemas/custody-entry.schema.json`

## Hard rules

- **SHA-256 only.** MD5 and SHA-1 are NIST SP 800-86 deprecated for forensic use — Cedar policy DENIES them.
- **Bundle hash is reproducible.** Always `sort manifest.sha256 | sha256sum` to compute.
- **custody.log is append-only.** Never edit prior lines. To correct, append a new CORRECTION entry.
- **One catalog per round.** Cross-round summary at `<incident_dir>/manifest.sha256` is generated separately at incident close.
- **Document gaps explicitly.** UNREACHABLE / TIMEOUT / PERMISSION_DENIED entries are valid; silence is not.
- **Witness commits to a SEPARATE git repo** — independent attestation. Recommend a private repo just for incident witnesses with branch protection.

## Standards referenced

- NIST SP 800-86 (Forensic Techniques for Incident Response) §6.4 — hash algorithm requirements
- ISO/IEC 27037 — chain-of-custody requirements
- RFC 3161 — optional timestamping

## Related

- Previous team: `team-2-evidence-collection` (must complete all Phase 3 collectors first)
- Next team: `team-4-analysis`
- Gates: `team-4-analysis` agents MUST verify bundle hash before citing any file
