# Changelog

All notable changes to opsbench are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).


## [1.1.3](https://github.com/shaiknoorullah/opsbench/compare/v1.1.2...v1.1.3) (2026-06-17)

## [1.1.2](https://github.com/shaiknoorullah/opsbench/compare/v1.1.1...v1.1.2) (2026-06-17)

## [1.1.1](https://github.com/shaiknoorullah/opsbench/compare/v1.1.0...v1.1.1) (2026-06-05)

### Documentation

* **repo:** F1-F6 specs + plans + scaffolds (megaroll rollout) ([#20](https://github.com/shaiknoorullah/opsbench/issues/20)) ([96aa098](https://github.com/shaiknoorullah/opsbench/commit/96aa098ebe59a8bf1c56336c5597bb71c517dfbe))

## [1.1.0](https://github.com/shaiknoorullah/opsbench/compare/v1.0.6...v1.1.0) (2026-06-05)

### Features

* **team-incident-response:** F0 bulk-ship MCP recipes (Pi-first) ([#19](https://github.com/shaiknoorullah/opsbench/issues/19)) ([305cd14](https://github.com/shaiknoorullah/opsbench/commit/305cd14e1d470147bc701de532ba2c16461b00ad))

## [1.0.6](https://github.com/shaiknoorullah/opsbench/compare/v1.0.5...v1.0.6) (2026-06-04)

### Documentation

* **repo:** ecosystem research catalog + F-series roadmap pivot ([#18](https://github.com/shaiknoorullah/opsbench/issues/18)) ([55ee133](https://github.com/shaiknoorullah/opsbench/commit/55ee133b73ef267bcef7c01223997def4d9302f4))

## [1.0.5](https://github.com/shaiknoorullah/opsbench/compare/v1.0.4...v1.0.5) (2026-06-03)

### Documentation

* **repo:** add multi-phase execution roadmap (P1–P6) ([#16](https://github.com/shaiknoorullah/opsbench/issues/16)) ([8e542b6](https://github.com/shaiknoorullah/opsbench/commit/8e542b60129e5df2df7db7bc240bf0bfb0b4388b))

## [1.0.4](https://github.com/shaiknoorullah/opsbench/compare/v1.0.3...v1.0.4) (2026-06-03)

### Bug Fixes

* **ci:** unblock chronic lint failures on main ([#15](https://github.com/shaiknoorullah/opsbench/issues/15)) ([03cf8e2](https://github.com/shaiknoorullah/opsbench/commit/03cf8e29c922bb3707d33624f26665c52005c9d8))

## [1.0.3](https://github.com/shaiknoorullah/opsbench/compare/v1.0.2...v1.0.3) (2026-06-03)

## [1.0.2](https://github.com/shaiknoorullah/opsbench/compare/v1.0.1...v1.0.2) (2026-05-31)

## [1.0.1](https://github.com/shaiknoorullah/opsbench/compare/v1.0.0...v1.0.1) (2026-05-30)


### Documentation

* **contributors:** refresh contributors list [skip ci] ([e200565](https://github.com/shaiknoorullah/opsbench/commit/e2005653502dd9dc9baab28790331887dfec37cc))

## 1.0.0 (2026-05-22)


### ⚠ BREAKING CHANGES

* previous tags (v1.0, v2.0, v3.0.0 under the prior name
k8s-incident-response-skills) have been removed. The opsbench repo starts
its versioning anew at v1.0.0.

Changes:
- package.json: version 3.0.0 → 0.0.0 (release-it will bump to v1.0.0 on first run)
- .github/workflows/release.yml: trigger on push to main (was workflow_dispatch only)
- release.yml: skip-release-bot guard to prevent release loop
- release.yml: plugin tarball built pre-release at the inferred next version
- CHANGELOG.md: documents the rename + version reset

After this commit lands on main, GitHub Actions will detect the
* marker in Conventional Commits and ship v1.0.0
automatically with the auto-generated changelog + plugin tarball asset.
* project renamed from k8s-incident-response-skills to
opsbench; repository restructured into packages/team-*/. The previous
top-level dirs (skills/, agents/, schemas/, policies/, hooks/,
mcp-recipes/, teams/) all moved into packages/team-incident-response/.
The manual cp -r install path is replaced by scripts/install.sh.

### Features

* initial publish — 11 chained skills for K8s incident response ([3052876](https://github.com/shaiknoorullah/opsbench/commit/305287638b5446a60910fba377fdd050115e8d7d))
* **release:** auto-gen release notes + all-contributors automation ([9fe3b62](https://github.com/shaiknoorullah/opsbench/commit/9fe3b62bfd74b995314a99adeda7f77e819cd06c))
* reset versioning to v1.0.0 + automate releases on main ([94068b0](https://github.com/shaiknoorullah/opsbench/commit/94068b08a7c6eca23009d3a70b7812250ae0f260))
* **v2:** DAG-of-DAGs architecture — 33 specialized subagents, 8 teams, schema/Cedar/hook gating ([bbc1225](https://github.com/shaiknoorullah/opsbench/commit/bbc1225a04db808b0ff57f310a520333ed34d660))


### Bug Fixes

* **ci:** remove npm cache directive — no lockfile yet, blocks setup-node ([54a5435](https://github.com/shaiknoorullah/opsbench/commit/54a54352e61fc1b1941694fe6c569b0254cdddc9))
* **ci:** use 'npm install' directly + commit lockfile ([626f072](https://github.com/shaiknoorullah/opsbench/commit/626f072c3281bbddee75e5797a36a0b238146cba))
* **release:** add @release-it/conventional-changelog devDep ([b6c7193](https://github.com/shaiknoorullah/opsbench/commit/b6c71935cadeab8083fd390dadd4cc7ffb70361f))
* **release:** skip lefthook on bot commits + relax CHANGELOG markdownlint ([68737c3](https://github.com/shaiknoorullah/opsbench/commit/68737c3569967c554d791c0d198f3afcce4f7259))


### Refactors

* restructure as opsbench multi-team agent toolkit ([ceee9cd](https://github.com/shaiknoorullah/opsbench/commit/ceee9cd8511c279f332670b481a19655655a61f7))


### Documentation

* hybrid K8s mesh reference architecture ([18f39fd](https://github.com/shaiknoorullah/opsbench/commit/18f39fdb5846f7182d9098a9a4344904f6567ffd))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- New entries are appended above this line by release-it -->
