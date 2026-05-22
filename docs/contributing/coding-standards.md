# Coding standards

## General

- **Conventional Commits** for every commit. Enforced by `commitlint` via lefthook + CI.
- **Atomic commits** — one logical change per commit.
- **Branch names** — `feat/...`, `fix/...`, `docs/...`, `chore/...`.
- **No force-push to `main`.**

## Markdown

- Lint clean against [`.markdownlint.yaml`](../../.markdownlint.yaml).
- ATX-style headings (`#`).
- Reference-style links for anything used more than twice.
- Code fences with language hints (` ```bash`, ` ```yaml`).

## YAML

- Lint clean against [`.yamllint.yaml`](../../.yamllint.yaml).
- Two-space indent.
- Lowercase keys; kebab-case where the consuming tool supports it.

## Shell

- `#!/usr/bin/env bash` + `set -euo pipefail` on every script.
- Lint clean against [`.shellcheckrc`](../../.shellcheckrc) (`shellcheck`).
- Functions over inline blocks for anything > 5 lines.
- `[[ ... ]]` not `[ ... ]`.
- Quote everything except `(( ... ))`.

## JSON

- Two-space indent.
- Sorted keys where the schema is order-insensitive.
- `additionalProperties: false` in schemas by default.

## Cedar

- One file per concern (`tools.cedar`, `governors.cedar`).
- Default-deny.
- Comment every `permit` with the intent.
- Validate via `cedar validate` in CI.

## Skill / agent prompts

- No emojis (unless user-requested at runtime).
- No forbidden words (see [Tone and constitution](../concepts/tone-and-constitution.md)).
- Every claim cited.
- Imperative voice for procedure steps.

## Tests

opsbench has no traditional unit tests today — its "tests" are:

1. Frontmatter validators (`scripts/validate-{skill,agent}.sh`)
2. Schema compilation (`ajv compile`)
3. Installer dry-run
4. lefthook pre-commit suite

When we add a programmatic skill engine (future), proper test coverage becomes mandatory.
