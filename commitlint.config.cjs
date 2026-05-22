/**
 * Conventional Commits configuration for opsbench.
 * https://www.conventionalcommits.org/en/v1.0.0/
 *
 * Scopes are intentionally team-oriented so the changelog reads by capability:
 *   feat(team-incident-response): add disk-pressure hypothesis agent
 *   fix(install): handle missing jq on macOS
 *   docs(concepts): clarify Cedar policy gating
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "perf",
        "refactor",
        "docs",
        "test",
        "build",
        "ci",
        "chore",
        "style",
        "revert",
      ],
    ],
    "scope-enum": [
      2,
      "always",
      [
        // Teams (one scope per team package)
        "team-incident-response",
        // Tooling
        "docs",
        "ci",
        "tooling",
        "scripts",
        "install",
        "release",
        "plugin",
        "codex-compat",
        "schemas",
        "policies",
        "hooks",
        "deps",
        // Repo-wide
        "repo",
      ],
    ],
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
    "subject-empty": [2, "never"],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [1, "always", 200],
  },
};
