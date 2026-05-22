---
name: evidence-request
description: Use when evidence-analyze returns NEED-MORE-EVIDENCE. Writes round-(N+1)/request.md with explicit per-artifact justification (which hypothesis, what falsification, why round-N evidence was insufficient, deadline, staleness threshold). REQUIRES human approval at every round boundary before triggering evidence-collection-orchestrator for the next round. Enforces all loop-control governors (max 5 rounds, decreasing budget, convergence check, wall-clock cap).
---

# Evidence Request

## When to invoke

- `evidence-analyze` returned `status: NEED-MORE-EVIDENCE` for round N
- Loop governors permit another round (rounds_remaining > 0, artifact budget available, wall-clock budget remaining)
- A new round is needed to test specific hypotheses with specific evidence

## The principle

```
EVERY ADDITIONAL ROUND MUST JUSTIFY ITSELF
```

Per published forensic methodology (NTSB party process, SANS DFIR, MITRE ATT&CK pivoting), each subsequent evidence-gathering round must be (a) targeted, (b) traceable to specific hypotheses, (c) bounded by a budget, and (d) approved by a human. Otherwise loops run forever or chase rabbit holes.

## Procedure

### Step 1: Read the prior round's verdict

```bash
ROUND_PRIOR=<N>
ROUND_NEXT=$((N + 1))
HANDOFF=<handoff>/<id>
VERDICT="$HANDOFF/round-$ROUND_PRIOR/verdict.md"
test -f "$VERDICT" || { echo "Prior verdict missing"; exit 1; }
```

Verify the verdict's frontmatter has `status: NEED-MORE-EVIDENCE` and contains GAP entries. If not, refuse — the loop should have ended.

### Step 2: Apply governors

Check each governor explicitly. If any fail, REFUSE the request and write an INCONCLUSIVE override to the prior verdict.

```yaml
governor_check:
  rounds_remaining: 5 - prior_round_N  # must be > 0
  artifact_budget_next:
    round_2: 50
    round_3: 25
    round_4: 12
    round_5: 6
  wall_clock_remaining_min: 24*60 - (cumulative_minutes_used)  # must be > 0
  new_hypothesis_present: <bool>  # must be true unless round=2
  falsification_artifacts_in_prior: <bool>  # must be true
```

### Step 3: Draft `round-<N+1>/request.md`

Use `templates/evidence-request-template.md`. Every requested artifact must specify:

- **Source family** (control_plane | observability | node_level | storage | network | app_layer | security | platform)
- **Specific command/query** that will produce it
- **Hypothesis served** (which H<n> from prior round)
- **Falsification flag** (`falsifies: H<n>` or `confirms: H<n>` — both must be present across the request)
- **Why prior round's evidence was insufficient** (specific GAP reference from prior verdict)
- **Staleness deadline** (collection must complete within X hours of incident_time, default 6h)
- **Per-artifact budget** (rough byte/row estimate)

### Step 4: HUMAN APPROVAL CHECKPOINT — mandatory

Pause execution. Print the drafted request and require the operator to explicitly approve before proceeding.

```
The next round (Round <N+1>) of evidence collection requires the following:

<print request.md contents>

Approve to dispatch evidence-collection-orchestrator (yes/no/edit)?
```

If `no`: write `status: HUMAN-DENIED` to the request file, write INCONCLUSIVE override to verdict, end the loop.
If `edit`: present the request for inline edits before approval.
If `yes`: proceed.

### Step 5: Trigger next round

After approval:

```bash
# Re-invoke the orchestrator with the new round
# evidence-collection-orchestrator reads round-<N+1>/request.md as input
```

Each subsequent round flows through the full Phase 3 → 4 → 5 chain again.

## Anti-patterns

- ❌ Generating round-N+1 without GAP entries from round-N's verdict ("just collect more in case")
- ❌ Asking for evidence that couldn't possibly fit the staleness window (e.g., requesting events from 8h ago when events TTL is 1h)
- ❌ Auto-approving rounds without human checkpoint (defeats the bias-mitigation)
- ❌ Inflating the artifact list to "make sure we get everything" — budgets are decreasing intentionally
- ❌ Letting the loop continue when no NEW hypothesis emerged in round N (convergence rule violation)

## Loop-control rationale (from research)

| Governor | Why |
|---|---|
| Max 5 rounds | Empirically, post-mortem investigations that exceed 5 evidence iterations almost always have a process problem, not an evidence problem. |
| Decreasing artifact budget | Forces sharpening: round 5 must be ≤6 artifacts, all surgically targeted. |
| Falsification quota | Anti-confirmation-bias. Without dedicated falsification, the loop becomes a yes-machine. |
| Human-in-loop at each round | Prevents agent runaway; injects analyst judgment. |
| Staleness deadline | Old evidence describes a different system state — useless or misleading. |
| Convergence check | If no new hypothesis after a round, the analyst is chasing details, not causes. |

## Related

- Parent: `storage-incident-response`
- Previous phase: `evidence-analyze` (status NEED-MORE-EVIDENCE)
- Triggers: `evidence-collection-orchestrator` (round N+1)
- Template: `templates/evidence-request-template.md`
- Research: `~/work/.handoffs/cluster-cpu-overcommit/2026-05-22/research-evidence-gathering-skill.md` §H
