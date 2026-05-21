---
name: parallel-hypothesis-debug
description: Use to investigate a failure with multiple plausible causes by dispatching one agent-teams:team-debugger subagent per hypothesis IN PARALLEL. Each agent gets explicit CONFIRM/FALSIFY criteria, evidence sources, and a read-only mandate. Returns FOR/AGAINST evidence with HIGH/MEDIUM/LOW confidence. Invoked as Phase 2 by storage-incident-response, but applies to any multi-cause infra incident (network outage, performance regression, cascading failure).
---

# Parallel Hypothesis Debugging

## When to invoke

- Master `storage-incident-response` calls this as Phase 2
- A failure has 2+ plausible root causes and you must distinguish between them with evidence
- A previous investigation produced a "probable" answer that the user (rightly) rejected
- The blast radius is wide and a wrong-cause fix would compound damage
- Single-agent investigation would create context bloat — split it instead

This is an APPLICATION of `superpowers:systematic-debugging`'s "form hypotheses" step, specialized for parallel infrastructure forensics.

## The principle

```
ONE HYPOTHESIS → ONE AGENT → READ-ONLY → EXPLICIT CONFIRM/FALSIFY CRITERIA → CITED EVIDENCE
```

Each agent works narrow and deep. The orchestrator (you) waits for ALL reports before deciding. No single agent gets a "do everything" megaprompt — that produces shallow, biased work.

## Procedure

### Step 1: Enumerate top hypotheses (you, before dispatching)

Cap at 3-4 hypotheses. Cover orthogonal failure domains. Typical taxonomies:

**Storage EIO incidents:**
| H | Domain | Example |
|---|---|---|
| H1 | Replication / quorum | Longhorn quorum loss, Patroni leader split, RMT replica unreachable |
| H2 | Local physical media | Disk SMART degraded, NVMe wear, hypervisor disk eviction |
| H3 | Network | Calico VXLAN drops, WireGuard handshake fail, iSCSI/TCMU TCP RSTs |
| H4 | Resource saturation | CPU pressure, iowait, kernel hung-task, memory cgroup OOM |

**Application crashes:**
| H | Domain |
|---|---|
| H1 | Bad release / config change |
| H2 | Upstream dependency failure |
| H3 | Resource exhaustion |
| H4 | Data-shape change (input that triggered latent bug) |

**Performance regressions:**
| H | Domain |
|---|---|
| H1 | Query plan change |
| H2 | Data growth crossing a threshold |
| H3 | Network/storage latency |
| H4 | Concurrent workload contention |

### Step 2: Build the dispatch prompt template (one per hypothesis)

Use `templates/team-debugger-prompt.md`. The template ensures every agent receives:

- The exact failure timestamp (UTC) and ±5min investigation window
- Read-only mandate
- Specific evidence sources (commands, log paths) — not just "investigate"
- Hypothesis statement
- Explicit CONFIRM criteria
- Explicit FALSIFY criteria
- Discipline rules (cite file:timestamp, distinguish observed/inferred, confidence levels)
- Required report format

### Step 3: Dispatch in parallel

Use the `Agent` tool with `subagent_type: "agent-teams:team-debugger"` and `run_in_background: true`. Send ALL hypotheses in a SINGLE message with multiple Agent calls so they run truly concurrently.

```
Agent({
  description: "H1: <short hypothesis name>",
  subagent_type: "agent-teams:team-debugger",
  prompt: <built from template>,
  run_in_background: true,
})
```

Repeat for H2, H3, H4 — same message.

### Step 4: Wait for ALL to complete

Do NOT act on partial results. Do NOT pre-judge based on the first to return. The discipline is: complete picture or nothing.

If one agent hangs (>15 min beyond reasonable), check its output file but do not interrupt unless certain it's stuck.

### Step 5: Hand off to forensic-synthesis

Once all return, invoke `forensic-synthesis` skill with the collected reports.

## Hypothesis prompt template

See `templates/team-debugger-prompt.md`. Filled-in example:

```
## Hypothesis H1: Longhorn write quorum loss caused ext4 journal abort

At <UTC timestamp> the ext4 filesystem on <device> logged N errors → JBD2 abort.

The hypothesis: <one-sentence claim about mechanism>

## Context (do not re-discover)
- <key fact 1>
- <key fact 2>

## What to investigate
1. <command + what to look for>
2. <command + what to look for>

## What would CONFIRM
- <specific evidence pattern>

## What would FALSIFY
- <specific evidence pattern>

## Discipline
- Cite file paths and timestamps
- Distinguish observed from inferred
- Report confidence HIGH/MEDIUM/LOW/INCONCLUSIVE
- If evidence is AGAINST, say so — don't bend findings

## Report format
[explicit structure]

Read-only. No mutations.
```

## Anti-patterns

- ❌ "Investigate the storage issue" (no hypothesis — agent will wander)
- ❌ One agent for all hypotheses (context bloat, biased synthesis inside the agent)
- ❌ Dispatching sequentially (defeats the parallelism point)
- ❌ Accepting "I think it's probably X" reports (no evidence → no decision)
- ❌ Pre-loading the agent with your guess of the answer (introduces confirmation bias)
- ❌ Skipping the FALSIFY criteria (agent becomes a YES-machine for its hypothesis)

## Anti-pattern recovery

If an agent returns shallow work or unsupported claims, re-dispatch with explicit "this is insufficient, here is what you missed". Do not write the report on top of weak evidence.

## Related

- Parent: `storage-incident-response`
- Previous phase: `incident-quarantine`
- Next phase: `forensic-synthesis`
- Foundation: `superpowers:systematic-debugging`, `superpowers:dispatching-parallel-agents`
- Memory: [[feedback_distributed_debugging]] (proven 2026-05-09 Calico VXLAN fix in 5 min)
