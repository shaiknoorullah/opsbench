# codex-compat-layer

Documents the Claude-Code-to-Codex-CLI tool mapping and provides an adapter that rewrites Claude-Code-only references in skill files for use under [`openai/codex`](https://github.com/openai/codex).

## Why this exists

Claude Code and Codex CLI have overlapping but non-identical tool surfaces. A skill that calls `Skill`, `Agent`, or `TaskCreate` in Claude Code needs a different incantation in Codex.

## Tool mapping

| Claude Code | Codex CLI equivalent | Notes |
| ----------- | -------------------- | ----- |
| `Read` / `Edit` / `Write` | native file ops | semantically equivalent |
| `Bash` | shell exec | Codex shell exec lacks Claude Code's session affinity — long-running background commands need explicit job control |
| `Grep` | native grep | equivalent |
| `WebFetch` / `WebSearch` | Codex web tool (where enabled) | content shape differs; output parsing required |
| `Skill` | none | skills are inlined as instructions; the `/skill-name` slash invocation is not a Codex primitive |
| `Agent` | none (workaround: spawn sub-process) | Codex has no first-class subagent dispatch. Workarounds: (a) spawn a second `codex` process per agent; (b) inline the agent prompt and rely on the same LLM |
| `TaskCreate` | TODO markers in working tree | use `TODO:` comments + a planning file; no scheduler |
| `mcp__*` tools | identical | both runtimes use the MCP standard |

## What the adapter does

`adapt.sh` reads a Claude Code skill file (`SKILL.md` or agent `.md`) and rewrites it for Codex by:

1. Stripping `Skill` invocations and replacing them with the inlined skill body.
2. Replacing `Agent`/`TaskCreate` references with TODO-marker workflow instructions.
3. Adding a top-of-file note: `<!-- codex-compat: this skill is auto-adapted from the Claude Code variant -->`.
4. Preserving all MCP `mcp__*` tool references unchanged.

## Usage

```bash
# Adapt a single skill
bash tools/codex-compat-layer/adapt.sh \
  packages/team-incident-response/skills/forensic-synthesis/SKILL.md

# Adapt all skills in a team
bash tools/codex-compat-layer/adapt.sh --team team-incident-response

# Adapt everything (called by scripts/install.sh --codex)
bash tools/codex-compat-layer/adapt.sh --all
```

Output goes to `~/.codex/skills/` by default (override with `CODEX_PREFIX`).

## Caveats

The adapter is a **best-effort** conversion. The hard cases — `parallel-hypothesis-debug` (which fundamentally needs subagent dispatch) — produce a Codex variant that requires the user to manually fan out work to separate `codex` sessions. The adapted file documents that requirement at the top.

PRs to improve the mapping for specific skills are welcome.
