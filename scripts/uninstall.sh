#!/usr/bin/env bash
# =============================================================================
# opsbench — uninstaller
# Removes opsbench-managed files under ~/.claude. Leaves user settings alone.
# =============================================================================
set -euo pipefail

PREFIX="${OPSBENCH_PREFIX:-${HOME}/.claude}"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=1; shift ;;
        --prefix)  PREFIX="$2"; shift 2 ;;
        -h|--help)
            cat <<EOF
Usage: $0 [--dry-run] [--prefix DIR]

Removes opsbench-managed directories. Does NOT modify settings.json — clean up
hook references there yourself after uninstall.
EOF
            exit 0
            ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

run() {
    if [[ ${DRY_RUN} -eq 1 ]]; then
        echo "[dry-run] $*"
    else
        eval "$*"
    fi
}

for sub in hooks schemas policies mcp-recipes; do
    target="${PREFIX}/${sub}/opsbench"
    if [[ -d "${target}" ]]; then
        run "rm -rf '${target}'"
    fi
done

# Skills/agents live alongside user content; only remove opsbench-tagged ones.
# Each opsbench SKILL.md/agent .md contains the marker `# opsbench:team=<name>`
# in frontmatter — adapt this loop if your install used the marker.
echo "Note: ${PREFIX}/skills and ${PREFIX}/agents may still contain opsbench files."
echo "If you used the default install, the opsbench files are: see manifest at"
echo "  ${PREFIX}/schemas/opsbench/<team>/  (if present, you already removed it)."
echo ""
echo "Remember to remove hook references from ${PREFIX}/settings.json."
