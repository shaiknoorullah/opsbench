---
name: team-4-analysis
description: Round-N analysis of the sealed evidence corpus. hypothesis-generator emits 3-5 ranked hypotheses; 4 specialized investigators (storage, network, control-plane, app) run in parallel against the corpus; forensic-synthesizer aggregates verdicts into a NIST 800-86 narrative. Verdict-blind to prior rounds (anti-confirmation-bias).
---

# Team 4 — Analysis / hypothesis

## Composition

| Subagent | Role |
|---|---|
| `hypothesis-generator` | Reads cataloged evidence; emits 3-5 ranked hypotheses with CONFIRM/FALSIFY criteria + initial confidence |
| `hypothesis-storage` | Investigates storage-layer hypotheses (Longhorn, Ceph, ext4, JBD2, iSCSI/TCMU sense codes) |
| `hypothesis-network` | Investigates network-layer hypotheses (Calico Felix, Cilium Hubble, WireGuard, TCP RST patterns) |
| `hypothesis-control-plane` | Investigates etcd/kube-apiserver/controller-manager hypotheses |
| `hypothesis-app` | Investigates app-layer hypotheses (Patroni state, Keeper Zxid, ClickHouse system.replication_queue) |
| `forensic-synthesizer` | Aggregates verdicts into single round-N/verdict.md. Refuses ROOT_CAUSE_CONFIRMED unless exactly one hypothesis = HIGH + CONFIRMED. |

## Sequencing (within team)

```
hypothesis-generator (sequential, reads sealed catalog)
  └── emits 3-5 hypotheses with CONFIRM/FALSIFY criteria
      └── incident-commander fans out hypothesis investigators IN PARALLEL:
            ├── hypothesis-storage (if any storage hypothesis)
            ├── hypothesis-network (if any network hypothesis)
            ├── hypothesis-control-plane (if any control-plane hypothesis)
            └── hypothesis-app (if any app-layer hypothesis)
          (irrelevant investigators sit the round out)
                  └── forensic-synthesizer
                        └── writes round-N/verdict.md (draft)
                              └── hands off to team-5 enforcement → team-8 arbiter
```

## Inputs

- `<incident_dir>/round-<N>/manifest.sha256` (sealed by team-3)
- `<incident_dir>/round-<N>/bundle.sha256.txt`
- `<incident_dir>/round-<N>/evidence/...` (read-only)
- For round N≥2: also reads `round-<N-1>/verdict.md` BUT only for the FALSIFY criteria, NEVER for the verdict status (verdict-blind discipline)

## Outputs

- `<incident_dir>/round-<N>/hypotheses/H<n>-verdict.json` (one per investigator, schema-validated)
- `<incident_dir>/round-<N>/verdict.md` (forensic-synthesizer output, schema-validated)

## Hooks involved

- `PreToolUse` → bundle-hash verification gate: every investigator must first verify `sort manifest.sha256 | sha256sum == bundle.sha256.txt` or be DENIED any Read against the corpus
- `PostToolUse` → schema-validate verdicts before persistence

## Schemas enforced

- Hypothesis verdict: `schemas/hypothesis-verdict.schema.json`
- Round verdict: `schemas/round-verdict.schema.json`

## Hard rules

- **Verdict-blind.** Investigators receive only the round-N evidence corpus + the hypothesis statement. They do NOT see prior verdicts (except for inheritance of FALSIFY criteria targeted explicitly at carry-over hypotheses).
- **One hypothesis per investigator.** No megaprompts.
- **Read-only.** Cedar policy denies all mutations from this team.
- **Verbatim citations.** Quote log lines exactly; never paraphrase.
- **FOR + AGAINST.** Every verdict must include both sections — pure-FOR investigator reports are rejected.
- **"Probable" forbidden** without explicit user permission. Use HIGH/MEDIUM/LOW + CONFIRMED/LIKELY/UNLIKELY/FALSIFIED/INCONCLUSIVE.

## Related

- Previous team: `team-3-cataloging` (must seal bundle first)
- Concurrent: `team-5-enforcement` (validates verdicts as they're produced)
- Next team: `team-8-loop-control` (verdict-arbiter consumes verdict.md)
- On CONFIRMED → `team-7-recovery`; on NEED_MORE_EVIDENCE → `team-8-loop-control` → next round through team-2
