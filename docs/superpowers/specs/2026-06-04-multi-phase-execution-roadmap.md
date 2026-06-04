# Multi-Phase Execution Roadmap

> ⚠️ **SUPERSEDED 2026-06-04** by [`2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md).
>
> This P1–P7 roadmap was approved earlier the same day, then a 25-domain ecosystem research workflow (367 candidates surveyed) revealed the original team-package-first ordering was wrong. The F-series replaces it with a foundation-first shape (policy + evidence layer → recipes → teams). Kept in tree as historical record; do not act on the P-numbered items.

**Status:** SUPERSEDED 2026-06-04 (was: approved 2026-06-04)
**Author:** Claude Code session (Shaik Noorullah, driver)
**Scope:** Track the sequence of sub-projects between v3.x polish and v4.x team-package work, integrating insights from external repos.

This document is an **index, not a design spec**. Each P-numbered item below gets its own brainstorming → spec → plan → implementation cycle. The cycle docs live in:

- Specs: `docs/superpowers/specs/<date>-<slug>-design.md`
- Plans: `docs/superpowers/plans/<date>-<slug>-plan.md`

## Inputs

External repos evaluated 2026-06-04:

| Repo | Verdict | Role |
| ---- | ------- | ---- |
| microsoft/azure-skills | High fit | Reference as MCP recipe in P1; cross-link from Azure recipe |
| microsoft/hve-core | Low fit | Cross-reference only (Copilot Chat-flavored, different surface) |
| Azure/git-ape | High fit | Template for `packages/team-platform-engineering` structure in P4 |
| AgentOps-AI/agentops | Low fit | Cross-reference; no Claude Code support, would need a hook shim build |

## Sub-projects (in execution order)

### P1 — v3.x polish: MCP recipes + azure-skills reference

Add `Falco`, `OpenCTI`, `TheHive`, `azure-skills` MCP recipes to `packages/team-incident-response/mcp-recipes/`. Update `azure-mcp.md` to cross-link azure-skills. Verify each MCP server exists upstream before authoring (no fabricated recipes).

### P2 — v3.x polish: installer matrix (Homebrew + AUR + nix flake)

New `tools/install-packaging/` with Homebrew formula + tap, AUR PKGBUILD, `flake.nix`. CI matrix in `.github/workflows/pkg-build.yml` triggered on tag push.

### P3 — Cross-cutting: Codex CLI parity for team-incident-response

Strengthen `tools/codex-compat-layer/adapt.sh`: replace today's `TODO_AGENT_CALL` / `TODO_TASK_CREATE` / `TODO_SKILL_INVOKE` placeholders with real Codex-CLI-equivalent semantics. Auto-generate Codex variants for all 11 skills + 33 agents. Add a `codex-validate.yml` CI job.

### P4 — v4.x: `team-platform-engineering` (git-ape-templated)

New top-level package mirroring `team-incident-response`'s shape. Initial agent roster modeled on git-ape's: orchestrator + IaC author + cost analyst + security analyst + RBAC recommender + drift detector + environment promoter. Skills cover Terraform / Pulumi / Crossplane / ArgoCD / Flux. Brings its own JSON schemas (`iac-plan`, `drift-report`, `cost-estimate`, `rbac-recommendation`), Cedar policies (tools + governors), hooks, and MCP recipes (Terraform Cloud, Pulumi Cloud, ArgoCD, Flux, OPA, Crossplane). **Needs a deep brainstorming pass — this is the heaviest of the six.**

### P5 — v4.x: `team-data-platform`

Same shape as P4 once that template is settled. Initial agent roster: backup verifier, schema-migration planner (Liquibase/Flyway/Atlas/Alembic), CDC pipeline troubleshooter (Debezium, Kafka Connect), data-quality validator. MCP recipes for the migration tools and CDC stacks.

### P6 — Cross-cutting: schema federation + Cedar policy library

Publish all schemas (9 today, more after P4/P5) to `schema.opsbench.io`. Seed `packages/cedar-library/` with a curated catalog of least-privilege policies for common agent shapes (read-only investigator, write-gated executor, human-approval-bound mutator, etc.).

### P7 — Architectural evaluation: sympozium-ai/sympozium

Evaluate `sympozium-ai/sympozium` — a Kubernetes multi-agent coordination layer by the k8sgpt author (MIT, 500+★, very active). It overlaps with opsbench in load-bearing ways (skill sidecars with ephemeral RBAC ≈ opsbench Cedar policies; shared SQLite workflow memory ≈ opsbench evidence ledger + custody log). But it's a different deployment model: K8s-native operator vs. file-based install into `~/.claude/`. Brainstorming pass should decide whether opsbench *integrates with*, *competes with*, or *layers on* sympozium. Output: a design doc with the chosen relationship + (if integration) a spec for that work. P7 deliberately follows P6 so we have the schema federation surface to align on.

## Dependency graph

```
P1 ──┐
P2 ──┼──► (each independent, any order, but P1 first for fast wins)
P3 ──┘

P4 ──► P5  (P5 reuses P4's team-package template)

P4 + P5 ──► P6  (P6 federates schemas from both)

P6 ──► P7  (P7 wants federation surface to evaluate against)
```

## Execution policy

Per the brainstorming + executing-plans skills:

- Each sub-project goes through its own brainstorming pass before code touches main.
- Each sub-project ships as one or more PRs against `main`.
- After a sub-project's PR(s) merge, automatically roll forward to the next sub-project's brainstorming pass. Pause only for: blockers we can't safely resolve, design decisions the user has not delegated, or PR reviews that need human attention.
- Where work fans out naturally (e.g., P1's 4 independent recipes, P3's 11 + 33 skill/agent ports), use the `Workflow` tool to parallelize.

## Non-goals

- No vendoring of azure-skills, hve-core, git-ape, or agentops source. They're references and templates only.
- No new top-level teams beyond P4 and P5 in this roadmap (v5.x items remain on `ROADMAP.md` for later).
- No retroactive rewrites of merged `team-incident-response` content unless a phase forces it.
