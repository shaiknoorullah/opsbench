#!/usr/bin/env bash
# =============================================================================
# Codex CLI compat adapter — rewrites Claude Code skill/agent files for Codex.
# Best-effort; hard cases (Agent/TaskCreate) get TODO scaffolding + warnings.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PREFIX="${CODEX_PREFIX:-${HOME}/.codex}"

mode=""
target=""

usage() {
    cat <<EOF
Usage:
  $0 <path-to-skill.md>          # adapt single file
  $0 --team <slug>               # adapt all skills in a team
  $0 --all                       # adapt every team

Env:
  CODEX_PREFIX  Output dir (default: ~/.codex)
EOF
}

case "${1:-}" in
    --team) mode="team"; target="${2:?missing team}" ;;
    --all)  mode="all" ;;
    -h|--help|"") usage; exit 0 ;;
    *)      mode="single"; target="$1" ;;
esac

adapt_file() {
    local src="$1"
    local team_dir
    team_dir="$(echo "${src}" | awk -F/ '{for (i=1;i<=NF;i++) if ($i=="packages") {print $(i+1); exit}}')"
    if [[ -z "${team_dir}" ]]; then
        team_dir="unknown"
    fi
    local skill_name
    skill_name="$(basename "$(dirname "${src}")")"
    local out_dir="${PREFIX}/skills/${team_dir}/${skill_name}"
    mkdir -p "${out_dir}"
    local out="${out_dir}/SKILL.md"

    {
        echo "<!-- codex-compat: auto-adapted from ${src#"${ROOT}"/} -->"
        echo "<!-- Hard cases (Agent, TaskCreate, Skill) annotated inline with TODO. -->"
        echo ""
        # Replace Claude-Code-specific tool invocations with TODO scaffolding.
        sed -E \
            -e 's/\bAgent\b/TODO_AGENT_CALL/g' \
            -e 's/\bTaskCreate\b/TODO_TASK_CREATE/g' \
            -e 's/\bSkill\b/TODO_SKILL_INVOKE/g' \
            "${src}"
    } > "${out}"
    echo "Adapted ${src#"${ROOT}"/} -> ${out}"
}

case "${mode}" in
    single)
        [[ -f "${target}" ]] || { echo "Not a file: ${target}" >&2; exit 1; }
        adapt_file "${target}"
        ;;
    team)
        dir="${ROOT}/packages/${target}"
        [[ -d "${dir}" ]] || { echo "No such team: ${target}" >&2; exit 1; }
        while IFS= read -r -d '' f; do adapt_file "${f}"; done < <(find "${dir}" -name "SKILL.md" -print0)
        ;;
    all)
        while IFS= read -r -d '' f; do adapt_file "${f}"; done < <(find "${ROOT}/packages" -name "SKILL.md" -print0)
        ;;
esac

echo "Done. Output: ${PREFIX}/skills/"
