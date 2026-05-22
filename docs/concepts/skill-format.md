# Skill format

A skill is a Markdown file with YAML frontmatter, conventionally named `SKILL.md`, living under `packages/<team>/skills/<skill-name>/SKILL.md`.

## Frontmatter

Required keys:

- `name` — kebab-case identifier matching the directory name
- `description` — one-line summary used in `/skill` discovery

Optional keys:

- `tools` — explicit allowlist of tools this skill expects to use
- `mcp` — explicit allowlist of MCP server tool prefixes
- `tags` — for discovery
- `version` — semver

## Example

```yaml
---
name: storage-incident-response
description: |
  Master orchestration skill that runs the full chain: timeline init -> quarantine ->
  source-discovery -> collection -> cataloging -> analysis -> loop-or-recover ->
  post-incident-artifacts.
tools:
  - Read
  - Bash
  - Skill
  - Agent
version: 3.0.0
---
```

## Body

The body of the file is the prompt material. By convention:

1. **Overview** — what this skill does in 2-3 sentences
2. **When to use** — explicit trigger conditions
3. **Pre-conditions** — what must be true before running
4. **Procedure** — numbered steps; reference other skills by `Skill: <name>` and agents by `Agent: <name>`
5. **Outputs** — what artifacts this skill produces and where
6. **Post-conditions** — what must be true after a successful run

## Validation

CI runs [`scripts/validate-skill.sh`](../../scripts/validate-skill.sh) which checks that every `SKILL.md` has at least `name:` and `description:` frontmatter keys. Future iterations will validate frontmatter against a JSON Schema.
