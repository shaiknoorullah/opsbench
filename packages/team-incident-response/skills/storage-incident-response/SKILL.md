---
name: storage-incident-response
description: Use immediately when a storage incident is detected — EIO errors, ext4 journal abort, Longhorn FailedRebuilding, "Buffer I/O error" in dmesg, PostgreSQL EIO on COPY/CHECKPOINT, ClickHouse part-corruption, or any case where the underlying storage state is uncertain and data is at risk. Master orchestration skill that runs the full chain: timeline init → quarantine → source-discovery → collection (round N) → cataloging → analysis (round N) → loop-or-recover → post-incident-artifacts. Supports iterative evidence-gathering loops (up to 5 rounds) with human approval at each boundary. Never start recovery before forensic synthesis returns CONFIRMED.
---

# Storage Incident Response

## When to invoke

This skill applies the moment ANY of these signals appear:

- `EXT4-fs error` / `journal has aborted` / `Remounting filesystem read-only` in dmesg
- `Buffer I/O error` / `critical medium error` in kernel logs
- Longhorn volume `robustness: degraded` that does not self-heal in 5 min
- Longhorn replica `FailedRebuilding` or stuck `isRebuilding: true` at 0%
- PostgreSQL / ClickHouse / etcd / MySQL surfacing `Input/output error` on writes or `EIO` in app logs
- Kubelet evicting pods with `DiskPressure` while node has free space (paradox)
- Any `kubectl exec ... -- touch /var/lib/...` returns EIO
- Workload starts crash-looping with checksum/corruption errors and storage is suspected

## The Iron Law

```
QUARANTINE → DISCOVER → COLLECT → CATALOG → ANALYZE → (LOOP) → RECOVER → DOCUMENT
```

Every phase produces sealed artifacts and timeline entries. Recovery only proceeds after `evidence-analyze` returns `status: CONFIRMED`. Post-incident documentation is mandatory.

## Phase model

```
Phase 0:   incident-timeline (init)              ← starts the canonical timeline.md
Phase 1:   incident-quarantine                   ← stop bleeding, preserve evidence
Phase 2:   evidence-source-discovery             ← enumerate what's collectable; emit collection-plan.yaml
Phase 3.N: evidence-collection-orchestrator      ← dispatch parallel collectors per source family
Phase 4.N: evidence-cataloger                    ← SHA-256 manifest + chain-of-custody seal
Phase 5.N: evidence-analyze                      ← parallel hypotheses + forensic-synthesis per round
            └─ status: CONFIRMED           → Phase 6
            └─ status: NEED-MORE-EVIDENCE  → evidence-request (human approval) → Phase 3 with N+1
            └─ status: INCONCLUSIVE        → human escalation
Phase 6:   recovery                              ← user-led; uses other skills (subagent-driven-development, etc.)
Phase 7:   post-incident-artifact-generator      ← RCA, MIR, SLA breach, comms, attestation
```

Throughout: `incident-timeline` is updated on EVERY action by EVERY skill.

## Directory structure (canonical)

```
~/work/.handoffs/<project>/<YYYY-MM-DD>/incident-<id>/
├── timeline.md                       # append-only canonical chronology (incident-timeline)
├── quarantine-backup/                # incident-quarantine outputs
├── collection-plan.yaml              # evidence-source-discovery output
├── round-1/
│   ├── request.md                    # empty for round 1
│   ├── evidence/
│   │   ├── cluster-scoped/
│   │   ├── namespaces/<ns>/...
│   │   ├── nodes/<node>/...
│   │   ├── network/
│   │   ├── storage/
│   │   ├── observability/
│   │   ├── app-layer/
│   │   ├── security/
│   │   ├── platform/
│   │   └── artifacts/
│   ├── manifest.sha256
│   ├── bundle.sha256.txt
│   ├── catalog.md
│   ├── hypotheses/H1-report.md ...
│   └── verdict.md
├── round-2/                          # only if round 1 returned NEED-MORE-EVIDENCE
│   ├── request.md                    # justification for this round
│   ├── evidence/...
│   └── ...
├── custody.log                       # cross-round append-only
├── recovery-log.md                   # Phase 6 actions
└── final/
    ├── incident-report.md            # NIST SP 800-61r2
    ├── rca.md                        # 5-Whys + Apollo
    ├── mitigations.md                # CAPA
    ├── investigation.md              # NIST SP 800-86
    ├── sla-breach.md                 # if applicable
    ├── customer-comm.md
    ├── internal-comm.md
    ├── action-items.md
    ├── attestation.md                # who did what
    ├── manifest-final.sha256
    └── bundle-final.sha256.txt
```

## Skill chain

| Phase | Skill | What it does |
|---|---|---|
| 0 | `incident-timeline` (init) | Create `timeline.md`, declare IC/scribe/comms |
| 1 | `incident-quarantine` | Scale clients to 0, delete agg Service, default-deny NetPol, back up state |
| 2 | `evidence-source-discovery` | Probe 9 layers for available sources, emit `collection-plan.yaml` |
| 3.N | `evidence-collection-orchestrator` | Dispatch parallel collectors per source family; write to `round-N/evidence/` |
| 4.N | `evidence-cataloger` | SHA-256 each artifact, append `custody.log`, write `manifest.sha256` + `catalog.md` |
| 5.N | `evidence-analyze` | Verify bundle hash, dispatch `parallel-hypothesis-debug` against sealed evidence, run `forensic-synthesis`, write `verdict.md` with status |
| 5.N+ | `evidence-request` (only if NEED-MORE-EVIDENCE) | Draft `round-(N+1)/request.md` with per-artifact justification; human approval gate |
| 6 | Recovery (user-led) | Use `superpowers:subagent-driven-development`, `plan-execute-verify`, or domain skills |
| 7 | `post-incident-artifact-generator` | Generate NIST 4-doc suite + SLA breach + comms + action items + attestation |

## Hard rules (apply to all phases)

1. **No recovery action before `verdict.md` has `status: CONFIRMED`.** No fsck, no `kubectl delete pvc`, no `wal-g restore`, no ALTER TABLE.
2. **Back up state to handoff directory** before any scale-down or deletion.
3. **Keep coordination services running** (Keeper, etcd, Patroni HTTP, ZK) during quarantine.
4. **Never reboot a host during evidence collection** — kernel ring buffer + uncommitted journal pages contain irreplaceable evidence.
5. **Never `dmesg -c`** (clears the ring buffer).
6. **`incident-timeline` updates are mandatory** on every action — no silent operations.
7. **Loop governors are non-negotiable**: max 5 rounds, decreasing artifact budget, falsification quota, human approval at every round boundary.
8. **Final bundle SHA-256** must be sealed before incident closes. This is the immutable record.

## Loop governors (recap)

| Governor | Default | Enforced by |
|---|---|---|
| Max rounds | 5 | `evidence-analyze` / `evidence-request` |
| Per-round artifact budget | round-2 ≤50, round-3 ≤25, round-4 ≤12, round-5 ≤6 | `evidence-request` |
| Wall-clock budget | 24h cumulative | `evidence-analyze` |
| No-new-hypothesis convergence | If round N≥2 has no new H, stop | `evidence-analyze` |
| Falsification quota | ≥1 falsification artifact per round | `evidence-request` |
| Stale evidence guard | Evidence > incident_time + 6h flagged | `evidence-collection-orchestrator` |
| Human approval | Required at every round boundary (N≥2) | `evidence-request` |

## Related skills

- `incident-timeline` — canonical chronology (read by everything, written by everything)
- `incident-quarantine` — Phase 1
- `evidence-source-discovery` — Phase 2
- `evidence-collection-orchestrator` — Phase 3.N
- `evidence-cataloger` — Phase 4.N
- `evidence-analyze` — Phase 5.N
- `evidence-request` — round N+1 trigger
- `parallel-hypothesis-debug` — used by evidence-analyze
- `forensic-synthesis` — used by evidence-analyze
- `post-incident-artifact-generator` — Phase 7
- `incident-report-suite` — used by post-incident-artifact-generator
- `html-to-pdf` — used for leadership PDF rendering
- `superpowers:systematic-debugging` — general debugging discipline
- `superpowers:subagent-driven-development` — for Phase 6 recovery work

## Provenance

Codified after the 2026-05-22 chi-audit-0-1 ext4 journal abort. Research bundle: `~/work/.handoffs/cluster-cpu-overcommit/2026-05-22/research-evidence-gathering-skill.md` (40+ citations, NIST SP 800-86, ISO 27037, Google SRE Workbook, NTSB party-process, MITRE ATT&CK, replicatedhq/troubleshoot.sh).
