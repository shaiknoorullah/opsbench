# Hooks

Claude Code exposes lifecycle hooks: `SessionStart`, `PreToolUse`, `PostToolUse`, `SubagentStop`, `Stop`. opsbench teams ship hook scripts under `packages/<team>/hooks/` that enforce:

- **PreToolUse** — Cedar authorization. Classifies the tool call into a Cedar request and rejects it (exit 2) unless a `permit` matches. **Fails closed.**
- **PostToolUse** — chain-of-custody (sha256 + `custody.log`), timeline append, and queues schema validation for authored artifacts.
- **SessionStart** — injects current incident state (round, verdict status, pending approvals) and recalls the core rules.
- **SubagentStop** — writes a per-subagent trace, updates the progress ledger, and critiques authored artifacts for missing required fields.

A helper, **`hooks/lib/governor-check.sh`**, evaluates `governors.cedar` for round-boundary transitions (max rounds, per-round budgets, wall-clock cap, falsification requirement, recovery gate, staleness). It is invoked by the orchestrator/skill — not the harness — because loop transitions are not tool calls.

## PreToolUse: how authorization works

The hook reads the PreToolUse event (`tool_name`, `tool_input`, `cwd`), then:

1. **Resolves the calling agent** (the Cedar principal) from, in order: `$OPSBENCH_AGENT_NAME`, the stdin `agent_name`/`subagent_name`, or a `<incident_dir>/.opsbench-agent` marker. Claude Code does not put the subagent name in the PreToolUse payload, so the orchestrator must supply it (env or marker). **No identity ⇒ deny** — per-agent least privilege cannot be enforced without a principal.
2. **Classifies the action** into the `ns::verb` vocabulary (e.g. `kubectl scale` → `k8s::scale`, `ssh … journalctl` → `Bash::ssh::readonly`, `mcp__kubernetes__pods_delete` → `k8s::delete`). Unclassifiable shell/MCP calls map to deny-sink actions (`Bash::exec`, `mcp::unknown`) that no policy permits.
3. **Extracts resource attributes** (`path`, `namespace`, `command_class`, `exec_user`, `repo`) into the Cedar entities file.
4. **Derives context** (`verdict_status` from the latest round verdict; `human_approval`, `recovery_step_id`, `recovery_step_risk` from env/approval markers).
5. Calls `cedar authorize` (override the binary with `$OPSBENCH_CEDAR_BIN`). Exit 0 = allow, exit 2 = deny.

See [Cedar policies](cedar-policies.md) for the request shape and the policy model.

### Fail closed

The gate denies on any uncertainty: missing agent identity, missing `cedar` CLI, missing policy file, or a Cedar engine error. For local development without the `cedar` CLI installed, set `OPSBENCH_DEV_FAIL_OPEN=1` to allow through with a warning — **never** set this where the gate is relied upon.

### Configuration (env)

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `OPSBENCH_POLICIES_DIR` | auto (script-relative, then `~/.claude/policies/opsbench/<team>`) | where `cedar/tools.cedar` + `governors.cedar` live |
| `OPSBENCH_CEDAR_BIN` | `cedar` | the Cedar CLI to invoke |
| `OPSBENCH_DEV_FAIL_OPEN` | `0` (closed) | dev-only: allow when the cedar CLI is absent |
| `OPSBENCH_AGENT_NAME` | — | the calling subagent (Cedar principal) |
| `OPSBENCH_HUMAN_APPROVAL` | — | `1` marks the current step human-approved |
| `OPSBENCH_RECOVERY_STEP_ID` / `_RISK` | — | recovery step id (`S*`) and risk (`destructive`) for the recovery gate |

## Registration

After install, the user patches `~/.claude/settings.json` to register the hook scripts:

```json
{
  "hooks": {
    "PreToolUse":   "$CLAUDE_HOME/hooks/opsbench/team-incident-response/pre-tool-use.sh",
    "PostToolUse":  "$CLAUDE_HOME/hooks/opsbench/team-incident-response/post-tool-use.sh",
    "SubagentStop": "$CLAUDE_HOME/hooks/opsbench/team-incident-response/subagent-stop.sh",
    "SessionStart": "$CLAUDE_HOME/hooks/opsbench/team-incident-response/session-start.sh"
  }
}
```

The installer prints this snippet at the end of its run.

## Composing multiple teams

When more than one team is installed, each team's hooks live under a separate directory (`hooks/opsbench/<team>/`). The Claude Code `hooks` map takes one path per event — to chain, point each event at a dispatcher (a future opsbench feature; today, choose one team's hook chain per session).

## Authoring + testing hooks

- All hook scripts use `#!/usr/bin/env bash` and `set -uo pipefail`; decisions and exit codes are explicit so control-flow errors fail closed.
- Hooks must not block on the network — pre-fetch caches in SessionStart.
- Hooks must be idempotent on repeated invocation.
- Hooks **fail closed** (deny) on internal error, never open.
- The PreToolUse logic is covered by `hooks/tests/*.bats` (run `npm run validate:hooks`); a stub `cedar` captures the request so the suite runs without the engine. Policy *decisions* are covered separately by `npm run validate:cedar`.
