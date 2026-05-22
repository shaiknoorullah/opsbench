# Changelog

All notable changes to opsbench are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

This file is maintained automatically by `release-it` for releases after v3.0.0. Entries before v3.0.0 are summarized from the legacy `k8s-incident-response-skills` README.

## [3.0.0] — 2026-05-22

### Breaking

- **Project renamed** from `k8s-incident-response-skills` to **`opsbench`** to reflect its scope as a multi-team agent toolkit beyond incident response.
- **Repository restructured** into a monorepo of team packages under `packages/team-*`. The v2.0 top-level dirs (`skills/`, `agents/`, `schemas/`, `policies/`, `hooks/`, `mcp-recipes/`, `teams/`) all moved into `packages/team-incident-response/`.
- **Installer changed.** The new `scripts/install.sh` is the supported entry point — drop the previous manual `cp -r ...` commands.

### Added

- `scripts/install.sh` — idempotent installer with `--dry-run`, `--codex`, `--teams`, `--prefix`, `--version` flags.
- `scripts/doctor.sh` — install diagnostic tool.
- `scripts/new-team.sh` — scaffolds a new team package.
- `scripts/validate-{skill,agent}.sh` — frontmatter validators (also used in CI).
- `scripts/uninstall.sh` — clean uninstall.
- `tools/plugin-build/` — builds the Claude Code plugin tarball as a release asset.
- `tools/codex-compat-layer/` — Codex CLI compat documentation and adapter.
- `tools/skill-frontmatter-validator/` — used by CI.
- Lefthook git hooks (`lefthook.yml`): markdownlint, yamllint, shellcheck, cspell, cedar-validate, commitlint, frontmatter checks.
- Conventional Commits enforcement (`commitlint.config.cjs`).
- `release-it` configuration (`.release-it.json`) — auto-changelog + GitHub release + plugin tarball asset.
- GitHub Actions workflows: `ci.yml`, `release.yml`, `docs-deploy.yml`, `codeql.yml`.
- GitHub issue/PR templates, CODEOWNERS, dependabot.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md`, `SUPPORT.md`, `GOVERNANCE.md`, `ROADMAP.md`.
- `docs/concepts/` reference docs for skills, agents, teams, schemas, Cedar, hooks, MCP, tone.
- `docs/contributing/` guides for adding skills, agents, teams.

### Changed

- README rewritten as a multi-team toolkit landing page.

### Preserved

- All 11 skills, 33 subagents, 9 schemas, 2 Cedar policies, 4 hook scripts, and 17 MCP recipes are unchanged in content — only their paths moved (now under `packages/team-incident-response/`).
- v1.0 and v2.0 git tags continue to point to the pre-rename layout.

## [2.0.0] — 2026-05-22 (legacy)

- DAG-of-DAGs multi-agent architecture: 33 specialized subagents across 8 teams.
- JSON Schema validation for every artifact.
- Cedar policy gating via PreToolUse hook.
- 17 MCP recipes (Grafana, k8s, ClickHouse, Postgres, Slack, PagerDuty, GitHub, Azure, AWS, OpenTelemetry, Velociraptor, eBPF, plus custom Longhorn/Contabo/WireGuard recipes).

## [1.0.0] — 2026-05-22 (legacy)

- Initial release: 11 chained skills for K8s storage incident response.
- Iterative round-by-round forensic loop with NIST SP 800-86 chain of custody.
- Quarantine-first design; no recovery before forensic synthesis returns CONFIRMED.
