---
name: falco-event-ingest
description: Ingest Falco runtime-security events into an opsbench incident timeline via falcosidekick → CLI-Anything-generated wrapper. Use when a K8s incident involves syscall-level anomalies, container escapes, suspicious exec calls, file integrity violations, or any other Falco rule firing during the active incident window.
tools: Bash, Read, Write, Grep, Glob
---

# falco-event-ingest

Pull recent Falco events out of `falcosidekick` and append them as evidence (with SHA-256 sealing) to the current incident's `timeline.md` and `custody.log`.

## When to invoke

- During incident triage when the cluster runs Falco and the hypothesis-control-plane or hypothesis-storage agents need syscall-level signal.
- Periodically during the active incident window (typically every 5–10 minutes) as new events accumulate.
- When a hypothesis explicitly cites a Falco rule (`container_drift`, `terminal_shell_in_container`, `write_below_etc`, etc.) — pull the matching events before authoring the verdict.

## Why this is a SKILL, not a recipe

Falco has no canonical MCP server upstream. The community options either lack licenses or have not been touched in months (see the parent recipe `mcp-recipes/cli-anything-framework.md` for the reasoning). The honest path is:

1. Use `falcosidekick` (the official Falco companion) to stream Falco events to a webhook.
2. Use `CLI-Anything` to generate an agent-callable wrapper that reads from that webhook's storage (a local SQLite ring buffer by default).
3. Have this skill orchestrate the wrapper from inside opsbench, so events land in the incident timeline with chain-of-custody intact.

When/if `falcosecurity` or CNCF publishes an official Falco MCP, this skill gets replaced by a real recipe and the wrapper retires.

## Prerequisites

- Falco running on the target cluster (DaemonSet, recommended ≥ v0.40).
- `falcosidekick` installed and configured to write to a local webhook sink (template in this skill's `templates/`).
- `CLI-Anything` installed on the agent host (`pip install cli-anything-hub`). See `mcp-recipes/cli-anything-framework.md`.
- The generated wrapper installed at `/usr/local/bin/falco-events` (the harness template names it that — keep the name for the rest of this skill to work).

## Workflow

### Step 1 — Pull recent events

```bash
falco-events list --since "10m" --json > /tmp/falco-events-$(date -u +%Y%m%dT%H%M%SZ).json
```

### Step 2 — Filter to incident-relevant events

Drop events whose `output_fields.k8s_ns` is outside the incident's namespace scope. The incident dir's `scope.json` lists in-scope namespaces; cross-reference:

```bash
jq -c \
  --slurpfile scope "$INCIDENT_DIR/scope.json" \
  '. as $e | $scope[0].namespaces | any(. == $e.output_fields.k8s_ns) | select(.)' \
  /tmp/falco-events-*.json > /tmp/falco-events-scoped.jsonl
```

### Step 3 — Seal and catalog

Each scoped event becomes an evidence artifact. The `evidence-cataloger` agent will SHA-256-seal them and append to `custody.log`; this skill just needs to write them to the incident's `evidence/falco/` directory and emit a manifest:

```bash
mkdir -p "$INCIDENT_DIR/evidence/falco"
while IFS= read -r line; do
  ts=$(echo "$line" | jq -r '.time')
  rule=$(echo "$line" | jq -r '.rule' | tr -c 'a-zA-Z0-9_-' '_')
  f="$INCIDENT_DIR/evidence/falco/${ts}_${rule}.json"
  echo "$line" > "$f"
done < /tmp/falco-events-scoped.jsonl
```

### Step 4 — Append timeline entry

Use the `incident-timeline` skill's `append_event` flow with category `EXTERNAL_EVENT` and actor `falco-event-ingest`. Include a one-line summary per rule:

```bash
rules_seen=$(jq -r '.rule' /tmp/falco-events-scoped.jsonl | sort | uniq -c | awk '{printf "%s (%d)\n", $2, $1}')
echo "$rules_seen" >> "$INCIDENT_DIR/timeline.md"
```

(The `post-tool-use.sh` hook will auto-seal whatever files were written during this skill's execution — no extra SHA-256 step needed here.)

## Outputs

- `$INCIDENT_DIR/evidence/falco/<timestamp>_<rule>.json` — one file per scoped event.
- Timeline entries with category `EXTERNAL_EVENT` and a rules-seen summary.

## Limits

- falcosidekick's default ring buffer holds the last 24h of events. For longer incidents, configure it to spill to S3 (see template).
- The wrapper is regenerated each time Falco rule definitions change; stale wrappers may miss new rule fields.
- This skill does NOT trigger Falco rule re-evaluation. If you need that, use `kubectl rollout restart ds/falco -n falco` and re-run after a fresh sweep.

## See also

- `mcp-recipes/cli-anything-framework.md` — how the wrapper is generated.
- `skills/incident-timeline/` — timeline append semantics.
- `agents/team-3-cataloging/evidence-witness.md` — chain-of-custody attestor that downstream agents consult.
