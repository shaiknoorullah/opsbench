# Team orchestration

A **team** is a discipline-aligned package under `packages/team-<slug>/` that contains everything needed for a coherent workflow:

- **skills** — the high-level orchestration the user invokes
- **agents** — the specialized workers a skill dispatches
- **schemas** — JSON Schema for every artifact type the team produces
- **policies** — Cedar policies that gate every mutation
- **hooks** — Pre/Post/Stop hooks that enforce constitution + schema + tone at the Claude Code runtime layer
- **mcp-recipes** — install instructions for the MCP servers the team integrates with

## DAG-of-DAGs

Teams typically follow a DAG-of-DAGs shape:

- The **outer DAG** is the team's phases (quarantine -> collect -> catalog -> analyze -> recover -> author).
- Each phase is itself an **inner DAG** of subagents running in parallel where independent and in sequence where not.

This pattern is documented in detail in the incident-response team's [README](../../packages/team-incident-response/README.md).

## Parallelism

The benefit of DAG-of-DAGs is wall-time compression:

- Evidence collection: 7 parallel collectors
- Hypothesis investigation: 4 parallel investigators (one per hypothesis class)
- Post-incident authoring: 5 parallel authors (incident report, RCA, mitigations, investigation, customer comms)

A typical incident-response cycle that would take ~2h sequentially compresses to ~30 min.

## Designing a new team

See [Adding a team](../contributing/adding-a-team.md).
