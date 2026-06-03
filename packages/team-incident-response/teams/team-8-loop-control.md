---
name: team-8-loop-control
description: Governs the iterative round-N+1 evidence loop. verdict-arbiter (verdict-blind) decides CONFIRMED/NEED_MORE/INCONCLUSIVE per round. evidence-requester writes round-(N+1)/request.md with explicit per-artifact justification. human-escalation triggers on INCONCLUSIVE or governor breach. Enforces max 5 rounds, decreasing artifact budget, convergence check.
---

# Team 8 — Loop control

## Composition

| Subagent | Role |
|---|---|
| `verdict-arbiter` | Per round: emits ROOT_CAUSE_CONFIRMED / NEED_MORE_EVIDENCE / INCONCLUSIVE. Verdict-blind (re-evaluates from current evidence only). |
| `evidence-requester` | On NEED_MORE_EVIDENCE: writes round-(N+1)/request.md with per-artifact justification. Enforces governors. |
| `human-escalation` | On INCONCLUSIVE or governor breach: opens PagerDuty + Slack + Linear; awaits explicit human decision. |

## Sequencing

```
verdict-arbiter (sequential, after team-5 enforcement passes verdict.md)
  ├── reads round-N/verdict.md + governor state
  ├── applies arbiter rule:
  │     ROOT_CAUSE_CONFIRMED ← exactly one hypothesis = HIGH + CONFIRMED + FALSIFY criteria attempted
  │     NEED_MORE_EVIDENCE   ← at least one LIKELY/MEDIUM hypothesis with specific gaps
  │     INCONCLUSIVE         ← no hypothesis HIGH+CONFIRMED + no specific path forward
  └── routes:
        ├── CONFIRMED         → team-7-recovery
        ├── NEED_MORE_EVIDENCE → evidence-requester
        │     ├── writes round-(N+1)/request.md
        │     ├── enforces governors (max 5 rounds, decreasing budget, convergence check)
        │     └── HUMAN APPROVAL GATE
        │           ├── on approve: handoff to team-2-evidence-collection for round-(N+1)
        │           └── on deny: write INCONCLUSIVE override; goto human-escalation
        └── INCONCLUSIVE       → human-escalation
              ├── assembles escalation package
              ├── opens PagerDuty incident + Slack thread + Linear ticket
              └── awaits explicit human decision to continue/abort
```

## Inputs

- `<incident_dir>/round-<N>/verdict.md` (from team-4 forensic-synthesizer)
- `<incident_dir>/timeline.md`
- Governor state (rounds_used, artifact_budget_remaining, wall_clock_used_min)

## Outputs

- Updated `<incident_dir>/round-<N>/verdict.md` frontmatter with `arbiter_decision: <enum>`
- `<incident_dir>/round-<N+1>/request.md` (if NEED_MORE_EVIDENCE)
- `<incident_dir>/escalation-<ts>.md` + external tickets (if INCONCLUSIVE)

## Hooks involved

- `PreToolUse` → Cedar policy:
  - Only `verdict-arbiter` can edit `verdict.md` frontmatter
  - Only `evidence-requester` can write `round-N/request.md`
  - Only `human-escalation` can mutate external systems (PagerDuty/Slack/Linear)

## Schemas enforced

- Round verdict: `schemas/round-verdict.schema.json`
- Evidence request: `schemas/evidence-request.schema.json`

## Hard rules

- **Verdict-blind.** verdict-arbiter does NOT receive prior verdicts as input. Re-evaluates from current evidence only. (Anti-confirmation-bias per published forensic methodology.)
- **Governors are non-negotiable:**

  | Governor | Default | Enforced by |
  |---|---|---|
  | Max rounds | 5 | evidence-requester refuses round 6 |
  | Per-round artifact budget | r2≤50, r3≤25, r4≤12, r5≤6 | evidence-requester rejects oversized requests |
  | Wall-clock budget | 24h cumulative | both arbiter and requester check |
  | No-new-hypothesis convergence | round N≥2 must add a NEW hypothesis | arbiter forces INCONCLUSIVE if violated |
  | Falsification quota | ≥1 falsification artifact per round | enforced by team-4 + checked here |
  | Stale evidence | flagged if collected > incident_time + 6h | informational warning |
  | Human approval | required at every round boundary (N≥2) | evidence-requester gates |

- **INCONCLUSIVE is a valid output.** Forced under: 5 rounds exhausted; no new hypothesis; wall-clock breach.
- **Human-escalation BLOCKS the chain.** No autonomous continuation.

## Loop governors rationale (research-grounded)

| Governor | Why |
|---|---|
| Max 5 rounds | Empirical: post-mortems exceeding 5 evidence iterations almost always have a process problem, not an evidence problem |
| Decreasing budget | Forces sharpening: round 5 must be ≤6 surgically-targeted artifacts |
| Falsification quota | Anti-confirmation-bias. Without dedicated falsification, the loop becomes a yes-machine |
| Human-in-loop | Prevents agent runaway; injects analyst judgment |
| Convergence check | If no new hypothesis, the analyst is chasing details, not causes |

## Related

- Triggered by: `team-4-analysis` forensic-synthesizer hands off verdict.md
- Routes to: `team-7-recovery` (CONFIRMED), `team-2-evidence-collection` (NEED_MORE_EVIDENCE), `team-1-command` human-escalation (INCONCLUSIVE)
- Concurrent: `team-1-command` timeline-keeper logs every decision
