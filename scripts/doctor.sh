#!/usr/bin/env bash
# =============================================================================
# opsbench doctor — diagnose an existing install.
# =============================================================================
set -euo pipefail

PREFIX="${OPSBENCH_PREFIX:-${HOME}/.claude}"

if [[ -t 1 ]]; then
    G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'
else
    G=""; Y=""; R=""; N=""
fi
ok()   { printf "%s[ok ]%s %s\n" "${G}" "${N}" "$*"; }
warn() { printf "%s[warn]%s %s\n" "${Y}" "${N}" "$*"; }
err()  { printf "%s[err ]%s %s\n" "${R}" "${N}" "$*"; }

problems=0

check_dir() {
    if [[ -d "$1" ]]; then ok "$1"; else err "$1 missing"; problems=$((problems+1)); fi
}

echo "Inspecting prefix: ${PREFIX}"
check_dir "${PREFIX}"
check_dir "${PREFIX}/skills"
check_dir "${PREFIX}/agents"

if [[ -f "${PREFIX}/settings.json" ]]; then
    ok "${PREFIX}/settings.json"
    if grep -q "opsbench" "${PREFIX}/settings.json"; then
        ok "settings.json references opsbench hooks"
    else
        warn "settings.json does not reference opsbench hooks — incident-response gating disabled"
    fi
else
    warn "${PREFIX}/settings.json not found"
fi

for sub in hooks/opsbench schemas/opsbench policies/opsbench mcp-recipes/opsbench; do
    if [[ -d "${PREFIX}/${sub}" ]]; then
        count=$(find "${PREFIX}/${sub}" -mindepth 1 -maxdepth 1 -type d | wc -l)
        ok "${sub} (${count} team(s) installed)"
    else
        warn "${sub} not installed"
    fi
done

if [[ ${problems} -eq 0 ]]; then
    ok "opsbench install looks healthy."
    exit 0
else
    err "${problems} issue(s) found."
    exit 1
fi
