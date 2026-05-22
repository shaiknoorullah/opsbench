# Schemas and validation

Every artifact emitted by an opsbench team validates against a published JSON Schema. This is the difference between an agent that "writes reports" and one that produces machine-readable, reviewable evidence.

## Where they live

```
packages/<team>/schemas/<artifact>.schema.json
```

The incident-response team publishes nine schemas — see [`packages/team-incident-response/schemas/`](../../packages/team-incident-response/schemas/).

## Validation points

1. **Author time** — subagents are instructed to validate their output against the schema before emitting.
2. **PostToolUse hook** — when an agent calls `Write`, the hook validates the written file against the relevant schema.
3. **CI** — `ajv-cli compile` ensures the schemas themselves are well-formed.

## Why JSON Schema (not Zod / Pydantic / Cue)

- **Polyglot.** Validators exist in every language an agent might be implemented in.
- **MCP-friendly.** MCP tool inputs/outputs already use JSON Schema.
- **Reviewable.** Schemas are checked into Git and diffable.
- **Composable.** `$ref` enables shared definitions (`$defs/sha256-hash`, `$defs/iso-8601-utc`).

## Pattern for new artifact types

1. Add `packages/<team>/schemas/<name>.schema.json`
2. Reference it from the relevant agent's frontmatter (`output_schema:`)
3. Reference it from the relevant skill that consumes the artifact
4. Add a `validate-schema` step in the team's hook scripts
5. Add an example artifact under `packages/<team>/schemas/examples/<name>.example.json`

## Strictness

opsbench schemas use `additionalProperties: false` by default. This is intentional — drift in the schema must be a conscious authoring choice, not an accident.
