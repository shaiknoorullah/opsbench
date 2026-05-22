# Cedar policies

opsbench uses [Cedar](https://www.cedarpolicy.com/) — the open-source policy language originally from AWS — to gate every agent mutation.

## Why Cedar (not OPA / Rego)

- **Boundedly evaluable.** Cedar is intentionally not Turing-complete — policy evaluation is fast and analyzable.
- **Designed for fine-grained authorization** — the same shape ops teams need for per-tool, per-action gating.
- **Formal verification tools** — `cedar analyze` proves policies don't have unreachable rules.
- **Schema-aware** — policies are validated against an entity schema.

## Where they live

```
packages/<team>/policies/cedar/*.cedar
packages/<team>/policies/constitution.md
```

The incident-response team ships two policies:

- `tools.cedar` — per-subagent tool allowlists
- `governors.cedar` — loop control (max rounds, max budget, max wall-clock)

## Gating model

```
agent  ----> tool call ----> PreToolUse hook ----> cedar authorize ----> allow|deny
```

The hook scripts in `packages/<team>/hooks/pre-tool-use.sh` read the tool call context, build a Cedar request, and call the `cedar` CLI for an authorization decision. Deny is the default; allow requires an explicit policy match.

## Example

```cedar
// packages/team-incident-response/policies/cedar/tools.cedar
permit (
  principal == Agent::"hypothesis-storage",
  action    in [Action::"Read", Action::"Bash"],
  resource  in [Tool::"mcp__k8s__*", Tool::"mcp__grafana__*"]
);
```

This says: only the `hypothesis-storage` agent may call read/bash with the k8s + grafana MCP tools. Any other agent attempting the same calls will be denied at the PreToolUse hook.

## Authoring policies

See [Cedar docs](https://docs.cedarpolicy.com/) for syntax. The pattern in opsbench is:

1. Start with a default-deny.
2. Add one `permit` per (agent, action class, tool family) tuple.
3. Add governors as separate file (`governors.cedar`) for loop-control rules.
4. Run `cedar validate` in CI (handled by [`ci.yml`](../../.github/workflows/ci.yml)).
