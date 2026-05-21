---
incident_id: <id>
requesting_round: <N+1>
based_on_verdict_sha256: <round-N verdict file's sha256>
parent_verdict_status: NEED-MORE-EVIDENCE
requested_at_utc: <ISO8601>
staleness_deadline_utc: <incident_time + 6h>
governor_check:
  rounds_used_so_far: <N>
  rounds_remaining: <5 - N>
  artifact_budget_this_round: <50|25|12|6 depending on round>
  wall_clock_budget_remaining_min: <int>
  new_hypothesis_emerged_in_prior: <bool>
  falsification_artifacts_in_prior: <bool>
human_approval:
  approver: <name>
  approved_at_utc: <ISO8601 once approved>
  decision: pending | approved | denied | edited
---

# Evidence Request — Round <N+1>

## Why this round is needed

Round <N>'s verdict was NEED-MORE-EVIDENCE because:

- The evidence corpus could not <CONFIRM | FALSIFY> hypothesis H<n>: <reason>
- Specifically, GAP entries from round-<N>/verdict.md:
  - GAP-1: <what was missing>
  - GAP-2: <what was missing>

## Hypotheses being tested in this round

| H# | Hypothesis | Carried from round | Status to test |
|---|---|---|---|
| H1 | <text> | round-N | CONFIRM or FALSIFY |
| H2 | <text> | round-N | FALSIFY |
| H5 | <new hypothesis> | round-N+1 (new) | CONFIRM |

## Artifacts requested

Each artifact below must have all 6 fields populated.

### Artifact 1
- **Source family:** node_level
- **Specific command:** `journalctl -u containerd --since 'YYYY-MM-DD HH:MM' --until 'YYYY-MM-DD HH:MM'` on host <name>
- **Hypothesis served:** falsifies H1
- **Why prior round was insufficient:** Round-N collected only kernel journal; H1's specific claim about containerd OOM-killing pods requires the containerd unit log.
- **Staleness deadline:** Collected within 6h of incident_time
- **Estimated size:** <10 MB

### Artifact 2
- **Source family:** observability/prometheus
- **Specific command:** `range_query node_memory_MemAvailable_bytes{instance=~"<filter>"} step=15s window=±10min`
- **Hypothesis served:** confirms H5 (memory pressure)
- **Why prior round was insufficient:** Round-N collected load1 and iowait but not memory-pressure metrics.
- **Staleness deadline:** Prometheus retention 15d, well within window
- **Estimated size:** ~50 KB

### Artifact 3
- ...

## Anti-confirmation-bias check

This round's artifact list includes at least one artifact whose purpose is **FALSIFY** (not CONFIRM) the leading hypothesis from prior round. The falsification artifact(s) are:

- Artifact <N>: falsifies H<leading-from-prior>

If no falsification artifact is present, this request must be REJECTED at the human approval step.

## Convergence check

This round introduces hypothesis H<x> which was NOT present in round-<N>. (If no new hypothesis, request must be REJECTED unless this is round 2.)

## Budget breakdown

- Artifacts requested: <count> / <budget>
- Estimated total size: <size>
- Estimated collection wall-clock: <min>
- Cumulative wall-clock so far: <min> / 1440 (24h cap)

## Human approval

> **OPERATOR:** Review the artifact list above. Approve, deny, or edit before round-<N+1> collection begins.
>
> - approve  → triggers `evidence-collection-orchestrator` for round-<N+1>
> - deny     → writes `status: HUMAN-DENIED` and ends the loop with INCONCLUSIVE override
> - edit     → present inline edits, then re-approve
