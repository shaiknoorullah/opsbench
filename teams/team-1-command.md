---
name: team-1-command
description: Top-level coordination team for an active incident. Owns the outer DAG, holds Task Ledger + Progress Ledger, delegates phase work to teams 2-8. Composed of incident-commander (orchestrator), timeline-keeper (append-only chronology), quarantine-coordinator (Phase-1 isolation). Invoked at the moment an incident is declared.
---

# Team 1 — Command / coordination

## Composition

| Subagent | Role in DAG |
|---|---|
| `incident-commander` | Outer-DAG orchestrator. Maintains Task Ledger + Progress Ledger. Delegates to teams 2-8. Never executes mutations itself. |
| `timeline-keeper` | Append-only canonical chronology. Writes to `<incident>/timeline.md`. Strict schema. |
| `quarantine-coordinator` | Drives Phase 1: scale clients to 0, delete aggregate Services, default-deny NetworkPolicy. Backs up state. |

## When invoked

- An incident is declared (operator declares it, or alert + on-call decision)
- A signal in the master `storage-incident-response` skill matches

## Sequencing (within team)

```
incident-commander
  ├── (parallel) timeline-keeper init → write incident.timeline.md header
  └── quarantine-coordinator → scale + delete + NetworkPolicy (writes timeline entries via timeline-keeper)
```

## Outgoing handoffs

- → `team-2-evidence-collection`: collection-plan.yaml after quarantine settles (T+~2 min)
- → `team-8-loop-control`: every round, hand verdict.md to verdict-arbiter
- All teams write timeline events via `timeline-keeper` (never directly to timeline.md)

## Artifacts produced

- `<incident_dir>/timeline.md` (created here, appended-to forever)
- `<incident_dir>/quarantine-backup/*` (all pre-quarantine state)
- `<incident_dir>/ledger.json` (Task Ledger + Progress Ledger, written by incident-commander)

## Hooks involved

- `SessionStart` → injects `incident-state` context (current incident-id, round, last timeline entry)
- `PreToolUse` → Cedar gates every mutation; quarantine-coordinator's k8s::scale / k8s::delete / k8s::apply pass; nothing else in this team mutates
- `PostToolUse` → every state-backup file SHA-256'd and appended to custody.log

## Schemas enforced

- Timeline entries: `schemas/timeline-entry.schema.json`
- Task Ledger: `schemas/task-ledger.schema.json` (extension)

## Hard rules

- `incident-commander` does NOT execute mutations directly — always delegates
- `timeline-keeper` is APPEND-ONLY — never edits prior lines
- `quarantine-coordinator` ALWAYS writes state backup before scale/delete
- All three subagents enforce the Cedar policy via PreToolUse hook

## Related skills

- Parent: `storage-incident-response` (master orchestrator)
- Next team: `team-2-evidence-collection`
- Loop partner: `team-8-loop-control`
- Lifecycle partner: `team-6-authoring` (final phase)
