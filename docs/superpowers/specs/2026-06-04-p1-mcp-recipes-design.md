# P1 Spec — v3.x MCP recipes + reference integrations

> ⚠️ **SUPERSEDED 2026-06-04** by [`2026-06-04-f0-recipe-bulk-ship-design.md`](./2026-06-04-f0-recipe-bulk-ship-design.md).
>
> This P1 specced 5 hand-curated recipes. The ecosystem research catalog generated later the same day surfaced ~30 vendor-official MCPs that warrant inclusion; F0 bulk-ships them all in one PR. The TheHive + OpenCTI + azure-skills + k8sgpt + CLI-Anything-framework picks here are inherited by F0; the Falco substitution skill stays valid. Treat this doc as historical context.

**Status:** SUPERSEDED 2026-06-04
**Parent:** `docs/superpowers/specs/2026-06-04-multi-phase-execution-roadmap.md`
**Scope:** Five new MCP recipes plus one skill, all under `packages/team-incident-response/`. Updates the existing `azure-mcp.md` to cross-link the Microsoft `azure-skills` plugin. Adds a `docs/integrations.md` index that catalogs every external project opsbench references or wraps.

## Purpose

The ROADMAP names Falco / OpenCTI / TheHive as v3.x recipe targets. During brainstorming we expanded the set because:

- The user surfaced `microsoft/azure-skills` as a high-fit Azure agent-skill plugin → adds it as a recipe.
- `k8sgpt-ai/k8sgpt` ships a built-in MCP server (`k8sgpt serve --mcp`) and is directly aligned with `team-incident-response`'s K8s/SRE focus → adds it as a recipe.
- Falco has no canonical MCP server. Instead of recipe-ing an unlicensed 0-star POC, the user pointed at `HKUDS/CLI-Anything` as the wrapping framework. P1 documents CLI-Anything itself and ships a Falco-specific skill that uses it.

## In scope

### New MCP recipes

Each follows the existing template (see `packages/team-incident-response/mcp-recipes/azure-mcp.md`): purpose → source → install → configuration → auth → tools surfaced → safety notes → links.

1. **`thehive-mcp.md`** — Upstream: `StrangeBeeCorp/TheHiveMCP` (TheHive's official, MIT). Tools: case/alert/observable/task CRUD. Auth: API key + base URL. Safety: read-only by default; gate write tools through Cedar `tools.cedar` allowlist.
2. **`opencti-mcp.md`** — Upstream: `jhuntinfosec/mcp-opencti` (community, MIT, 26+ tools). Tools: indicator/observable/threat-actor lookup, sector/TTP/temporal queries, relationship traversal. Auth: OPENCTI_URL + OPENCTI_TOKEN. Caveat: community-maintained, document fallback.
3. **`azure-skills-mcp.md`** — Upstream: `microsoft/azure-skills` (Microsoft official, MIT). Multi-host install (Claude Code, Codex CLI, Copilot, Cursor). Tools: 200+ Azure + Foundry tools. Auth: `az login` or service-principal env vars. Note: this is a *plugin distribution* not a single MCP server — recipe explains the plugin-registry install flow.
4. **`k8sgpt-mcp.md`** — Upstream: `k8sgpt-ai/k8sgpt` (Apache 2.0). Run mode: `k8sgpt serve --mcp` (stdio) or `--mcp --http` (server). 12 tools, 3 resources surfacing K8s analyzers (Pods, Services, Deployments, Ingress, etc.). Auth: KUBECONFIG. Safety: anonymization via `--anonymize`. Strong cross-link with `team-incident-response`'s hypothesis-K8s agents.
5. **`cli-anything-framework.md`** — Upstream: `HKUDS/CLI-Anything` (Apache 2.0, ~42k★). Not a recipe in the usual sense — this is a *framework* for generating agent-callable CLI wrappers for arbitrary software. Recipe documents the install flow, the HARNESS.md generation pattern, the SKILL.md output format, and how to consume the resulting CLIs from a Claude Code skill. Acts as a pointer for any future "no MCP server upstream" situation (Falco, custom internal tools, etc.).

### New skill

`packages/team-incident-response/skills/falco-event-ingest/SKILL.md` — How to wire Falco -> falcosidekick -> CLI-Anything-generated CLI -> Claude Code. Templates for the falcosidekick config, the CLI-Anything HARNESS.md, and the resulting SKILL.md frontmatter that `team-incident-response` agents can call. Explicitly notes there is no canonical Falco MCP server today; if/when CNCF or `falcosecurity` publishes one, this skill gets replaced by a recipe.

### Updates to existing files

- `packages/team-incident-response/mcp-recipes/azure-mcp.md` — Add a "See also" section pointing at the new `azure-skills-mcp.md` and noting that azure-skills is the higher-level plugin layer that bundles Foundry + Azure MCP and adds skill-level orchestration. The existing recipe stays valid for users who want the low-level Azure MCP server alone.
- `packages/team-incident-response/README.md` — Refresh the "MCP recipes" count from 17 to 22 in the table; add a short paragraph pointing at `docs/integrations.md`.
- `cspell.json` — Add `falcosidekick`, `k8sgpt`, `OpenCTI`, `TheHive`, `StrangeBee`, `HKUDS`, `gbrigandi`, `jhuntinfosec`.

### New `docs/integrations.md`

A standing inventory of every external project opsbench references — recipe, skill, vendored, or pure cross-link. Initial rows:

| Project | License | How opsbench uses it | Sub-project / file |
|---|---|---|---|
| microsoft/azure-skills | MIT | Recipe + Azure plugin layer | P1 `azure-skills-mcp.md` |
| microsoft/hve-core | MIT (some CC-BY-SA 4.0) | Cross-reference only — different surface (Copilot) | This doc |
| Azure/git-ape | MIT | Future v4.x template for `team-platform-engineering` | Roadmap P4 |
| AgentOps-AI/agentops | MIT | Cross-reference only — Python SDK, no Claude Code | This doc |
| HKUDS/CLI-Anything | Apache 2.0 | Recipe + framework for tools without MCP | P1 `cli-anything-framework.md` |
| k8sgpt-ai/k8sgpt | Apache 2.0 | Recipe for K8s diagnostics MCP | P1 `k8sgpt-mcp.md` |
| StrangeBeeCorp/TheHiveMCP | MIT | Recipe for case management MCP | P1 `thehive-mcp.md` |
| jhuntinfosec/mcp-opencti | MIT | Recipe for threat-intel MCP | P1 `opencti-mcp.md` |
| sympozium-ai/sympozium | MIT | Deferred to its own sub-project P7 | Roadmap (to be added) |

## Out of scope (deferred)

- **Falco MCP recipe directly** — no canonical upstream; revisit when `falcosecurity` org or CNCF ships one. The Falco skill above unblocks users in the interim.
- **sympozium integration** — too large for P1; alternative deployment model that needs its own brainstorming pass.
- **hve-core porting** — Copilot Chat surface ≠ Claude Code SKILL.md format. Cross-reference only.
- **agentops Claude-Code hook shim** — interesting build but separable. Track as a potential side-quest.

## Architecture & data flow

No architectural change to opsbench. Recipes are pure documentation that users copy into their Claude Code MCP config. The CLI-Anything route adds *one new pattern* (CLI-Anything → SKILL.md → agent) that opsbench documents but does not vendor.

For the Falco skill specifically:

```
Falco syscall events
        │
        ▼
   falcosidekick (existing Falco companion)
        │  (webhook outputs)
        ▼
   CLI-Anything-generated falco-cli
        │  (JSON output mode)
        ▼
   team-incident-response skill: falco-event-ingest
        │
        ▼
   hypothesis-* agents (existing)
```

The custody hooks (`post-tool-use.sh`) already SHA-256-seal artifacts produced by tools and append to `custody.log` — Falco events flow through that same gate when consumed via the skill.

## Risks

| Risk | Mitigation |
|---|---|
| `jhuntinfosec/mcp-opencti` is low-star community code; could go unmaintained | Recipe documents `zxzinn/opencti-mcp` (also MIT) as fallback; users can swap by config diff |
| `azure-skills` install flow varies by host (Claude Code vs Copilot vs Codex) | Recipe lists each host's install command explicitly with links to upstream docs |
| CLI-Anything generates Python Click CLIs that need a runtime | Recipe notes the python3 + pip prerequisite; documents containerized install option |
| Falco skill depends on user having falcosidekick running | Skill explicitly documents the falcosidekick install + webhook config as prereq |

## Testing & verification

For each recipe:

1. Lint clean (markdownlint + cspell)
2. JSON snippets validate (parse via `jq -e`)
3. Where possible: install the upstream MCP server in a throwaway VM, run one tool through Claude Code's MCP debug mode, confirm the tool list matches what the recipe documents

For the Falco skill: run `bash scripts/validate-skill.sh` after authoring; manually exercise the falcosidekick → CLI-Anything → skill chain in a kind cluster as a stretch goal (mark as `[ ]` in PR test plan; not a merge blocker).

## Sequencing & PR layout

One PR:

- Title: `feat(team-incident-response): add MCP recipes for TheHive, OpenCTI, azure-skills, k8sgpt, CLI-Anything; add falco-event-ingest skill`
- Branch: `feat/p1-mcp-recipes-and-falco-skill`
- Files: 5 new recipes + 1 new skill (SKILL.md + templates dir) + 3 doc edits (`azure-mcp.md`, team README, `docs/integrations.md`) + 1 lint config edit (`cspell.json`)

If reviewer asks for split, fall back to: PR-A recipes only, PR-B Falco skill + integrations doc.

## Acceptance criteria

- [ ] All four CI check categories green (markdownlint, cspell, shellcheck, json-schema-validate)
- [ ] Each new recipe loads in Claude Code's MCP debug view without parse errors
- [ ] `docs/integrations.md` lists every external project this spec touches
- [ ] `azure-mcp.md` has a "See also" pointing at the new `azure-skills-mcp.md`
- [ ] Team README counts updated
- [ ] No new word added to `cspell.json` is misspelled (sanity-check upstream repo names)
