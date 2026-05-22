# Agent format

A subagent is a Markdown file with YAML frontmatter, living under `packages/<team>/agents/<sub-team>/<agent-name>.md`.

Subagents are the building blocks of a team's inner DAG. Each one has:

- a single goal (one verb + one noun)
- a narrow tool allowlist
- a narrow MCP allowlist
- a structured output spec (often a JSON Schema reference)

## Frontmatter

Required:

- `name` — kebab-case identifier
- `description` — one-line summary

Recommended:

- `tools` — explicit list of tools this agent may call (`Read`, `Bash`, `Grep`, etc.)
- `mcp` — explicit list of MCP server tool prefixes (`mcp__grafana__*`, `mcp__k8s__*`, …)
- `output_schema` — path to the JSON Schema this agent's output must validate against
- `cedar_policy` — path to the Cedar policy that gates this agent's mutations

## Example

```yaml
---
name: hypothesis-storage
description: Investigates storage-layer hypotheses for the active forensic round.
tools:
  - Read
  - Bash
mcp:
  - mcp__k8s__*
  - mcp__grafana__loki_query
output_schema: schemas/hypothesis-verdict.schema.json
cedar_policy: policies/cedar/tools.cedar
---
```

## Body conventions

1. **Role** — who the agent is and what it does in the larger DAG
2. **Inputs** — files / parameters expected
3. **Procedure** — explicit steps, including CONFIRM/FALSIFY criteria for hypothesis agents
4. **Output** — schema reference + example
5. **Tool budget** — anything special about call limits

## Validation

CI runs [`scripts/validate-agent.sh`](../../scripts/validate-agent.sh) to check frontmatter shape.
