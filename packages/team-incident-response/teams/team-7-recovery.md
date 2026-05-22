---
name: team-7-recovery
description: Plans, executes (with human approval at every gate), and verifies recovery from a CONFIRMED root cause. recovery-planner drafts; human approves; recovery-executor runs with Cedar-gated mutations; recovery-verifier confirms SLO/replication/backup health. The only team allowed to issue cluster-mutating operations.
---

# Team 7 — Recovery

## Composition

| Subagent | Role |
|---|---|
| `recovery-planner` | Drafts recovery-plan.md from verdict.md. Maps each step to a confirmed hypothesis. Requires human approval before execution. |
| `recovery-executor` | Executes APPROVED plan steps with PreToolUse Cedar gating every mutation. Halts on first failure. |
| `recovery-verifier` | Post-recovery health checks. SLO, replication, backup integrity, downstream consumer health. |

## Sequencing

```
recovery-planner (sequential)
  └── writes recovery-plan.md
        └── HUMAN APPROVAL GATE — operator reviews + approves or denies
              ├── if denied: write to verdict.md as INCONCLUSIVE override; end loop
              └── if approved: recovery-executor
                    ├── per step:
                    │     ├── PreToolUse Cedar gate (each mutation explicitly permitted)
                    │     ├── timeline.md entry BEFORE step
                    │     ├── execute
                    │     ├── timeline.md entry AFTER step (with exit code)
                    │     └── halt on non-zero exit
                    └── on completion: recovery-verifier
                          └── writes recovery-verification.md with PASS/FAIL per check
```

## Inputs

- `<incident_dir>/round-<final-N>/verdict.md` (must have `status: ROOT_CAUSE_CONFIRMED`)
- `<incident_dir>/timeline.md`
- All sealed evidence catalogs

## Outputs

- `<incident_dir>/recovery-plan.md` (schema-validated)
- `<incident_dir>/recovery-log.md` (append-only, per-step exit codes + sha256 before/after)
- `<incident_dir>/recovery-verification.md` (PASS/FAIL per SLO check)

## Hooks involved

- `PreToolUse` → Cedar policy gates EVERY mutation by `recovery-executor`. Each permitted action requires `context.human_approval == true` in policy evaluation.
- `PostToolUse` → SHA-256 pre/post state files; append to recovery-log + timeline

## Schemas enforced

- Recovery plan: `schemas/recovery-plan.schema.json`
- Recovery verification: `schemas/recovery-verification.schema.json`

## Hard rules

- **REFUSES to run unless `verdict.md` has `status: ROOT_CAUSE_CONFIRMED`.** No recovery on speculation.
- **Human approval gate is mandatory.** Cedar policy denies all `recovery-executor` mutations until `recovery-plan.md` has `human_approval: true` in frontmatter.
- **Each plan step maps to a hypothesis.** Steps without hypothesis-citation are rejected by schema-validator.
- **Halt on first non-zero exit.** Never auto-retry destructive operations.
- **Pre/post sha256 of state files.** Every mutated resource has a before-state and after-state snapshot in `recovery-log.md`.
- **Recovery-verifier is READ-ONLY.** Cannot fix anything; only reports.
- **On verifier FAIL**: artifact-suite (team-6) DOES NOT RUN. Loop returns to team-4 for re-analysis with the new failure as a new hypothesis.

## Cedar policy excerpt

```cedar
permit (
  principal == User::"recovery-executor",
  action,
  resource is K8sResource
) when {
  context.human_approval == true &&
  resource.path startsWith principal.approved_paths
};
```

## Related

- Previous team: `team-8-loop-control` verdict-arbiter returns CONFIRMED
- Concurrent: `team-1-command` timeline-keeper (every step logged)
- Next team: `team-6-authoring` (only after verifier PASS)
- On verifier FAIL: returns to `team-4-analysis` for a new round
