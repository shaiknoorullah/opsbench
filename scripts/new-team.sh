#!/usr/bin/env bash
# =============================================================================
# Scaffold a new opsbench team package.
# Usage: bash scripts/new-team.sh team-platform-engineering
# =============================================================================
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <team-slug>"
    echo "  team-slug must start with 'team-' and use kebab-case."
    exit 1
fi

slug="$1"
if [[ ! "${slug}" =~ ^team-[a-z][a-z0-9-]*$ ]]; then
    echo "Invalid slug '${slug}'. Expected: team-<kebab-case-name>"
    exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${root}/packages/${slug}"

if [[ -d "${target}" ]]; then
    echo "Team already exists: ${target}"
    exit 1
fi

mkdir -p "${target}"/{skills,agents,schemas,policies,hooks,mcp-recipes}

cat > "${target}/README.md" <<EOF
# ${slug}

> One-line description of this team's mission.

## Overview

Describe what this team does, what problem it solves, and the agents/skills it
ships.

## Skills

| Skill | Purpose |
| ----- | ------- |
|       |         |

## Agents

| Agent | Role | Tools |
| ----- | ---- | ----- |

## Install

\`\`\`bash
bash scripts/install.sh --teams ${slug}
\`\`\`

## Contributing

See [docs/contributing/adding-a-team.md](../../docs/contributing/adding-a-team.md).
EOF

cat > "${target}/package.json" <<EOF
{
  "name": "@opsbench/${slug}",
  "version": "0.1.0",
  "private": true,
  "description": "TODO",
  "license": "MIT"
}
EOF

echo "Created ${target}"
echo "Next: edit packages/${slug}/README.md and add scope to commitlint.config.cjs."
