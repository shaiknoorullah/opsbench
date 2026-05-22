#!/usr/bin/env bash
# =============================================================================
# opsbench — installer
# -----------------------------------------------------------------------------
# Idempotent installer that copies opsbench teams (skills, agents, hooks,
# schemas, policies, MCP recipes) into the user's Claude Code config dir.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/shaiknoorullah/opsbench/main/scripts/install.sh | bash
#   bash scripts/install.sh [--dry-run] [--codex] [--prefix DIR] [--teams a,b,c]
#
# Env overrides (all optional):
#   OPSBENCH_VERSION    Tag to install (default: latest GitHub release).
#   OPSBENCH_PREFIX     Target dir (default: ~/.claude).
#   OPSBENCH_TEAMS      Comma list of team package names (default: all).
#   OPSBENCH_REPO       Repo slug (default: shaiknoorullah/opsbench).
#
# Exit codes:
#   0  success / dry-run completed
#   1  generic error
#   2  unsupported platform
#   3  missing required dependency
#   4  unwritable prefix
# =============================================================================
set -euo pipefail

# -------------------------------- constants ----------------------------------
readonly SCRIPT_NAME="opsbench-install"
readonly DEFAULT_REPO="shaiknoorullah/opsbench"
readonly DEFAULT_PREFIX="${HOME}/.claude"
readonly REQUIRED_CMDS=(git curl jq tar)

# -------------------------------- ui helpers ---------------------------------
if [[ -t 1 ]]; then
    readonly C_RESET=$'\033[0m'
    readonly C_BOLD=$'\033[1m'
    readonly C_DIM=$'\033[2m'
    readonly C_RED=$'\033[31m'
    readonly C_GREEN=$'\033[32m'
    readonly C_YELLOW=$'\033[33m'
    readonly C_BLUE=$'\033[34m'
    readonly C_CYAN=$'\033[36m'
else
    readonly C_RESET="" C_BOLD="" C_DIM="" C_RED="" C_GREEN="" C_YELLOW="" C_BLUE="" C_CYAN=""
fi

log()   { printf "%s[%s]%s %s\n"   "${C_DIM}" "${SCRIPT_NAME}" "${C_RESET}" "$*"; }
info()  { printf "%s[%s]%s %s\n"   "${C_BLUE}" "${SCRIPT_NAME}" "${C_RESET}" "$*"; }
ok()    { printf "%s[ok ]%s %s\n"  "${C_GREEN}" "${C_RESET}" "$*"; }
warn()  { printf "%s[warn]%s %s\n" "${C_YELLOW}" "${C_RESET}" "$*"; }
err()   { printf "%s[err ]%s %s\n" "${C_RED}" "${C_RESET}" "$*" >&2; }

die() {
    local code="${2:-1}"
    err "$1"
    exit "${code}"
}

# -------------------------------- args ---------------------------------------
DRY_RUN=0
CODEX_MODE=0
PREFIX="${OPSBENCH_PREFIX:-${DEFAULT_PREFIX}}"
TEAMS_FILTER="${OPSBENCH_TEAMS:-}"
VERSION="${OPSBENCH_VERSION:-}"
REPO="${OPSBENCH_REPO:-${DEFAULT_REPO}}"

usage() {
    cat <<EOF
${C_BOLD}opsbench installer${C_RESET}

Usage:
  $0 [options]

Options:
  --dry-run            Print actions without making changes.
  --codex              Install Codex CLI compat variants in addition to Claude Code.
  --prefix <dir>       Install into <dir> (default: ${DEFAULT_PREFIX}).
  --teams <a,b,c>      Comma-separated list of team package names. Default: all.
  --version <tag>      Install a specific release tag (default: latest).
  --repo <owner/name>  GitHub repo slug (default: ${DEFAULT_REPO}).
  -h, --help           Show this help.

Examples:
  $0 --dry-run
  $0 --teams team-incident-response
  OPSBENCH_VERSION=v3.0.0 $0
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)         DRY_RUN=1; shift ;;
        --codex)           CODEX_MODE=1; shift ;;
        --prefix)          PREFIX="${2:?missing dir}"; shift 2 ;;
        --teams)           TEAMS_FILTER="${2:?missing teams}"; shift 2 ;;
        --version)         VERSION="${2:?missing version}"; shift 2 ;;
        --repo)            REPO="${2:?missing repo}"; shift 2 ;;
        -h|--help)         usage; exit 0 ;;
        *)                 err "Unknown arg: $1"; usage; exit 1 ;;
    esac
done

# -------------------------------- preflight ----------------------------------
detect_platform() {
    local os
    os="$(uname -s)"
    case "${os}" in
        Linux*)   PLATFORM="linux" ;;
        Darwin*)  PLATFORM="macos" ;;
        MINGW*|MSYS*|CYGWIN*)
            die "Windows native shells are not supported. Use WSL 2 with a Linux distro and re-run." 2
            ;;
        *)
            die "Unsupported platform: ${os}" 2
            ;;
    esac
    info "Platform: ${PLATFORM}"
}

check_deps() {
    local missing=()
    for cmd in "${REQUIRED_CMDS[@]}"; do
        if ! command -v "${cmd}" >/dev/null 2>&1; then
            missing+=("${cmd}")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        err "Missing required commands: ${missing[*]}"
        err "Install them and re-run. On macOS:  brew install ${missing[*]}"
        err "On Debian/Ubuntu:                  sudo apt-get install -y ${missing[*]}"
        exit 3
    fi
    ok "All required commands present: ${REQUIRED_CMDS[*]}"
}

check_prefix() {
    if [[ ! -d "${PREFIX}" ]]; then
        die "Prefix dir '${PREFIX}' does not exist. Install Claude Code first: https://docs.claude.com/en/docs/claude-code" 4
    fi
    if [[ ! -w "${PREFIX}" ]]; then
        die "Prefix dir '${PREFIX}' is not writable by user $(id -un)." 4
    fi
    ok "Prefix dir '${PREFIX}' is writable."
}

resolve_version() {
    if [[ -n "${VERSION}" ]]; then
        ok "Using pinned version: ${VERSION}"
        return
    fi
    info "Resolving latest release from ${REPO}..."
    local api_url="https://api.github.com/repos/${REPO}/releases/latest"
    VERSION="$(curl -fsSL "${api_url}" 2>/dev/null | jq -r '.tag_name // empty' || true)"
    if [[ -z "${VERSION}" ]]; then
        warn "No published release found — falling back to main branch."
        VERSION="main"
    fi
    ok "Resolved version: ${VERSION}"
}

# -------------------------------- workdir ------------------------------------
WORKDIR=""
cleanup() {
    if [[ -n "${WORKDIR}" && -d "${WORKDIR}" ]]; then
        rm -rf "${WORKDIR}"
    fi
}
trap cleanup EXIT

fetch_source() {
    WORKDIR="$(mktemp -d -t opsbench.XXXXXX)"
    info "Fetching ${REPO}@${VERSION} into ${WORKDIR}..."
    local tarball="https://github.com/${REPO}/archive/refs/tags/${VERSION}.tar.gz"
    if [[ "${VERSION}" == "main" ]]; then
        tarball="https://github.com/${REPO}/archive/refs/heads/main.tar.gz"
    fi
    if [[ ${DRY_RUN} -eq 1 ]]; then
        log "[dry-run] curl -fsSL ${tarball} | tar -xz -C ${WORKDIR} --strip-components=1"
        # Use local checkout as a stand-in so we can still enumerate teams.
        local local_root
        local_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
        cp -R "${local_root}"/. "${WORKDIR}/"
        return
    fi
    curl -fsSL "${tarball}" | tar -xz -C "${WORKDIR}" --strip-components=1
    ok "Source fetched."
}

# -------------------------------- install ------------------------------------
enumerate_teams() {
    local pkg_root="${WORKDIR}/packages"
    if [[ ! -d "${pkg_root}" ]]; then
        die "No packages/ directory in source tree — corrupt release?" 1
    fi
    local found=()
    while IFS= read -r dir; do
        local name
        name="$(basename "${dir}")"
        if [[ -n "${TEAMS_FILTER}" ]]; then
            # shellcheck disable=SC2076
            if [[ ",${TEAMS_FILTER}," =~ ",${name}," ]]; then
                found+=("${name}")
            fi
        else
            found+=("${name}")
        fi
    done < <(find "${pkg_root}" -maxdepth 1 -mindepth 1 -type d | sort)
    if [[ ${#found[@]} -eq 0 ]]; then
        die "No teams matched filter '${TEAMS_FILTER}'." 1
    fi
    TEAMS=("${found[@]}")
    info "Teams to install: ${TEAMS[*]}"
}

install_team() {
    local team="$1"
    local src="${WORKDIR}/packages/${team}"
    info "Installing ${team}..."

    # Map source subdirs to ~/.claude layout.
    local mappings=(
        "skills:skills"
        "agents:agents"
        "hooks:hooks/opsbench/${team}"
        "schemas:schemas/opsbench/${team}"
        "policies:policies/opsbench/${team}"
        "mcp-recipes:mcp-recipes/opsbench/${team}"
    )

    for m in "${mappings[@]}"; do
        local from="${src}/${m%%:*}"
        local to="${PREFIX}/${m##*:}"
        if [[ ! -d "${from}" ]]; then
            continue
        fi
        if [[ ${DRY_RUN} -eq 1 ]]; then
            log "[dry-run] mkdir -p ${to}"
            log "[dry-run] cp -R ${from}/. ${to}/"
        else
            mkdir -p "${to}"
            cp -R "${from}/." "${to}/"
        fi
    done
    ok "Installed ${team}."
}

install_codex_variants() {
    if [[ ${CODEX_MODE} -ne 1 ]]; then
        return
    fi
    local adapter="${WORKDIR}/tools/codex-compat-layer/adapt.sh"
    if [[ ! -x "${adapter}" ]]; then
        warn "Codex compat adapter not found at ${adapter} — skipping --codex stage."
        return
    fi
    info "Generating Codex CLI variants..."
    if [[ ${DRY_RUN} -eq 1 ]]; then
        log "[dry-run] would run ${adapter} for each installed skill"
    else
        # The adapter is idempotent and writes into ${PREFIX}/codex/
        OPSBENCH_PREFIX="${PREFIX}" bash "${adapter}" --all
    fi
    ok "Codex variants generated."
}

print_next_steps() {
    cat <<EOF

${C_BOLD}${C_GREEN}opsbench installed${C_RESET} (version ${VERSION})

Next steps:

  ${C_CYAN}1.${C_RESET} Wire up Claude Code hooks (one-time):
       Edit ${PREFIX}/settings.json and add the per-team hook scripts under the
       \`hooks\` key. Example for team-incident-response:

         "hooks": {
           "PreToolUse":   "\$CLAUDE_HOME/hooks/opsbench/team-incident-response/pre-tool-use.sh",
           "PostToolUse":  "\$CLAUDE_HOME/hooks/opsbench/team-incident-response/post-tool-use.sh",
           "SubagentStop": "\$CLAUDE_HOME/hooks/opsbench/team-incident-response/subagent-stop.sh",
           "SessionStart": "\$CLAUDE_HOME/hooks/opsbench/team-incident-response/session-start.sh"
         }

  ${C_CYAN}2.${C_RESET} Install MCP servers you want (per-recipe):
       ls ${PREFIX}/mcp-recipes/opsbench/

  ${C_CYAN}3.${C_RESET} Verify install:
       bash <(curl -fsSL https://raw.githubusercontent.com/${REPO}/${VERSION}/scripts/doctor.sh)

Docs:  https://github.com/${REPO}#readme
Issues: https://github.com/${REPO}/issues

EOF
}

# -------------------------------- main ---------------------------------------
main() {
    info "${C_BOLD}opsbench installer${C_RESET}"
    if [[ ${DRY_RUN} -eq 1 ]]; then
        warn "DRY-RUN MODE — no files will be written."
    fi
    detect_platform
    check_deps
    check_prefix
    resolve_version
    fetch_source
    enumerate_teams
    for t in "${TEAMS[@]}"; do
        install_team "${t}"
    done
    install_codex_variants
    print_next_steps
}

main "$@"
