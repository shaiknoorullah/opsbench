# Contributing to opsbench

Thanks for considering a contribution. opsbench is built to be the highest-quality OSS agent toolkit for ops teams — that bar applies to PRs too.

## Quick links

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security disclosures](SECURITY.md)
- [Governance](GOVERNANCE.md)
- [Adding a skill](docs/contributing/adding-a-skill.md)
- [Adding an agent](docs/contributing/adding-an-agent.md)
- [Adding a team](docs/contributing/adding-a-team.md)
- [Coding standards](docs/contributing/coding-standards.md)

## Local setup

```bash
git clone https://github.com/shaiknoorullah/opsbench.git
cd opsbench
npm install        # installs lefthook + linters
```

`npm install` runs `lefthook install` via the `prepare` script, wiring up pre-commit, commit-msg, and pre-push hooks.

## Development workflow

1. **Branch off `main`.** Use a topic name: `feat/team-platform-engineering`, `fix/install-jq-detection`.
2. **Make atomic commits** using [Conventional Commits](https://www.conventionalcommits.org/). Examples:

   ```
   feat(team-incident-response): add disk-pressure hypothesis agent
   fix(install): detect jq on macOS via brew --prefix
   docs(concepts): clarify Cedar policy gating
   ```

   Allowed scopes are enforced by `commitlint.config.cjs`.

3. **Run local validations** before pushing:

   ```bash
   npm run lint
   npm run validate
   ```

4. **Open a PR** against `main`. CI must pass:
   - markdownlint, yamllint, cspell, shellcheck
   - JSON Schema compilation (`ajv`)
   - skill + agent frontmatter validation
   - `install.sh --dry-run`
   - Cedar validation (if `.cedar` files changed)

5. **Get review.** Maintainers will review against the conventions in [`docs/contributing/coding-standards.md`](docs/contributing/coding-standards.md).

## What kinds of PRs are most welcome?

In rough priority order:

1. **New teams** — `team-platform-engineering`, `team-security-response`, `team-network-operations`, `team-it-helpdesk`, `team-data-platform`. See [`docs/contributing/adding-a-team.md`](docs/contributing/adding-a-team.md).
2. **MCP recipes** for missing tools.
3. **Cedar policies** for least-privilege patterns.
4. **Codex CLI compat** mappings in `tools/codex-compat-layer/`.
5. **Documentation** improvements — concept docs, reference architectures, tutorials.
6. **Schema additions** for new artifact types.

## What we will close

- PRs without Conventional Commit messages.
- PRs that introduce binary dependencies without justification.
- PRs that violate the [Constitution](packages/team-incident-response/policies/constitution.md) tone rules (notably: emitting the word "probable" in forensic artifacts).
- PRs that bypass Cedar / hook gating to "make it work."

## Releases

Releases are automated via `release-it` triggered on pushes to `main`. See [`.release-it.json`](.release-it.json) and [`.github/workflows/release.yml`](.github/workflows/release.yml). Maintainers cut releases; contributors don't need to bump versions manually.

## Questions

Open a [discussion](https://github.com/shaiknoorullah/opsbench/discussions) (preferred) or an issue.
