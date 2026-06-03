# Governance

opsbench is an open-source project under the MIT license. This document describes how decisions are made, how teams are added, and how maintainership works.

## Roles

| Role | Responsibility |
| ---- | -------------- |
| **BDFL** | Final tie-breaker on direction. Currently: [@shaiknoorullah](https://github.com/shaiknoorullah). |
| **Maintainers** | Review and merge PRs, cut releases, triage issues. |
| **Team owners** | Each team package (`packages/team-*`) has one or more owners listed in `.github/CODEOWNERS`. They are the canonical reviewers for changes in that team. |
| **Contributors** | Anyone with a merged PR. |

## Adding a team

New team packages go through a lightweight RFC:

1. Open a [`new-team-proposal`](.github/ISSUE_TEMPLATE/new-team-proposal.yml) issue describing:
   - Discipline (e.g. "platform engineering", "security response")
   - Target users
   - Initial skill / agent list
   - Standards the team will follow (NIST, ISO, ITIL, …)
   - Proposed owner(s)
2. Maintainers respond within 7 days with one of: `accepted`, `needs-revision`, `out-of-scope`.
3. On acceptance, scaffold the team:

   ```bash
   bash scripts/new-team.sh team-<slug>
   ```

4. Add the new scope to `commitlint.config.cjs`.
5. Add owners to `.github/CODEOWNERS`.
6. Open the implementation PR.

## Releases

- Releases follow [SemVer](https://semver.org/).
- A release is cut from `main` by a maintainer running `npm run release` (which invokes [release-it](https://github.com/release-it/release-it)).
- Conventional Commits drive the changelog and version bump:
  - `fix:` → patch
  - `feat:` → minor
  - `feat!:` / `fix!:` / `BREAKING CHANGE:` → major
- Each release ships a Claude Code plugin tarball (`opsbench-<version>.tar.gz`) as a GitHub release asset.

## Decision making

- **Routine PRs** — single maintainer approval.
- **New team** — 2 maintainer approvals + BDFL sign-off.
- **Breaking change to an existing team** — team owner approval + 1 maintainer.
- **Governance changes** — BDFL sign-off; 7-day comment window on a PR to this file.

## Conflict of interest

Contributors who are also paid maintainers of an upstream tool (e.g. an MCP server) should disclose this in their PR when adding integration for that tool.

## Why so formal?

Most agent toolkits will accumulate years of skill / agent contributions from a wide range of practitioners. Formalizing this up front — even at very small scale — prevents the structural debt that other plugin ecosystems hit at the 100-contributor mark.
