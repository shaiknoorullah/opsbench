#!/usr/bin/env bash
# =============================================================================
# Build the opsbench Claude Code plugin tarball.
#
# Assembles packages/team-*/{skills,agents} into the canonical plugin layout
# observed at ~/.claude/plugins/cache/claude-plugins-official/<plugin>/<version>/
# and produces tools/plugin-build/output/opsbench-<version>.tar.gz
# =============================================================================
set -euo pipefail

VERSION="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -z "${VERSION}" ]]; then
    VERSION="$(jq -r .version "${ROOT}/package.json")"
fi

OUT_ROOT="${ROOT}/tools/plugin-build/output"
STAGE="${OUT_ROOT}/staging/opsbench/${VERSION}"
TARBALL="${OUT_ROOT}/opsbench-${VERSION}.tar.gz"

echo "Building opsbench plugin v${VERSION}"
echo "Staging: ${STAGE}"

rm -rf "${OUT_ROOT}/staging"
mkdir -p "${STAGE}/.claude-plugin" "${STAGE}/skills" "${STAGE}/agents" \
         "${STAGE}/schemas" "${STAGE}/policies" "${STAGE}/hooks" \
         "${STAGE}/mcp-recipes"

# -------------------------------- manifest -----------------------------------
cat > "${STAGE}/.claude-plugin/plugin.json" <<JSON
{
  "name": "opsbench",
  "description": "Multi-team agent toolkit for DevOps, SRE, Platform, Infra, IT, Security and Network teams.",
  "version": "${VERSION}",
  "author": {
    "name": "Shaik Noorullah",
    "email": "snoorullah@proficientnow.com"
  },
  "homepage": "https://github.com/shaiknoorullah/opsbench",
  "repository": "https://github.com/shaiknoorullah/opsbench",
  "license": "MIT",
  "keywords": [
    "incident-response",
    "sre",
    "devops",
    "platform-engineering",
    "forensics",
    "nist-800-86",
    "kubernetes",
    "skills",
    "subagents"
  ]
}
JSON

cat > "${STAGE}/.claude-plugin/marketplace.json" <<JSON
{
  "schema": "https://anthropic.com/claude-code/plugin-marketplace.schema.json",
  "name": "opsbench",
  "version": "${VERSION}",
  "categories": ["operations", "incident-response", "sre", "platform-engineering"],
  "publishers": [{"name": "shaiknoorullah"}]
}
JSON

# -------------------------------- assemble -----------------------------------
for pkg in "${ROOT}"/packages/team-*; do
    [[ -d "${pkg}" ]] || continue
    team="$(basename "${pkg}")"
    echo "  packing ${team}..."

    if [[ -d "${pkg}/skills" ]]; then
        cp -R "${pkg}/skills/." "${STAGE}/skills/"
    fi
    if [[ -d "${pkg}/agents" ]]; then
        cp -R "${pkg}/agents/." "${STAGE}/agents/"
    fi
    for sub in schemas policies hooks mcp-recipes; do
        if [[ -d "${pkg}/${sub}" ]]; then
            mkdir -p "${STAGE}/${sub}/${team}"
            cp -R "${pkg}/${sub}/." "${STAGE}/${sub}/${team}/"
        fi
    done
done

# Stamp version on disk for the doctor script to read.
echo "${VERSION}" > "${STAGE}/.opsbench-version"

# -------------------------------- tarball ------------------------------------
mkdir -p "${OUT_ROOT}"
( cd "${OUT_ROOT}/staging" && tar -czf "${TARBALL}" "opsbench/${VERSION}" )

echo ""
echo "Built: ${TARBALL}"
ls -lh "${TARBALL}"
