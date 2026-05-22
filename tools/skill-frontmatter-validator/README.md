# skill-frontmatter-validator

Used by CI ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) and the lefthook `pre-push` hook to verify that every `SKILL.md` and agent `.md` file under `packages/*/` has well-formed YAML frontmatter.

Today this is implemented as the shell scripts:

- [`scripts/validate-skill.sh`](../../scripts/validate-skill.sh)
- [`scripts/validate-agent.sh`](../../scripts/validate-agent.sh)

This directory is reserved for a future Node/Python rewrite that does deeper checks:

- Frontmatter schema (e.g. `tools: [...]` is a list of known tool names)
- Cross-references (`Skill: foo` resolves to an existing skill)
- Tone constants from `policies/constitution.md`
- MCP tool names match the recipes under `mcp-recipes/`

Until that lands, the shell scripts are the source of truth.
