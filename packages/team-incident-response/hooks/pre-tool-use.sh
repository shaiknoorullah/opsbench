#!/usr/bin/env bash
# hooks/pre-tool-use.sh — Cedar authorization gate for the team-incident-response subagents.
#
# Invoked by the Claude Code harness before every tool call. Reads the PreToolUse event from
# stdin (Claude Code schema):
#   { "session_id","cwd","hook_event_name":"PreToolUse","tool_name","tool_input":{...} }
# The per-agent model additionally needs the calling agent's identity. Claude Code does not
# put the subagent name in the PreToolUse payload, so it is resolved (in priority order) from:
#   1. $OPSBENCH_AGENT_NAME            (set by the orchestrator when spawning a subagent)
#   2. stdin .agent_name / .subagent_name (if a future harness provides it)
#   3. <incident_dir>/.opsbench-agent  (marker file written at subagent start)
# If no identity can be resolved, the gate FAILS CLOSED — per-agent least privilege cannot be
# enforced without knowing the principal.
#
# Exit 0  = allow
# Exit 2  = deny (stderr reason surfaces back to the agent)
# Exit other = harness error (treated as fail-closed by the orchestrator)
#
# Engine: the `cedar` CLI (override with $OPSBENCH_CEDAR_BIN). The request/entities shape this
# hook builds is validated against policies/cedar/opsbench.cedarschema and exercised by the
# bats suite in hooks/tests/.

set -uo pipefail

# ----------------------------------------------------------------------------- config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CEDAR_BIN="${OPSBENCH_CEDAR_BIN:-cedar}"
# Default is FAIL-CLOSED. Set OPSBENCH_DEV_FAIL_OPEN=1 only in local dev without the cedar CLI.
DEV_FAIL_OPEN="${OPSBENCH_DEV_FAIL_OPEN:-0}"
AUDIT_LOG="${OPSBENCH_AUDIT_LOG:-/tmp/opsbench-pre-tool-use.jsonl}"

# Resolve the policies dir across both the source-repo and installed (~/.claude) layouts.
resolve_policies_dir() {
  if [[ -n "${OPSBENCH_POLICIES_DIR:-}" ]]; then echo "$OPSBENCH_POLICIES_DIR"; return; fi
  local team prefix c
  team="$(basename "$SCRIPT_DIR")"                        # installed: hooks/opsbench/<team>
  prefix="$(cd "$SCRIPT_DIR/../../.." 2>/dev/null && pwd)"  # empty if that depth doesn't exist
  for c in \
    "$SCRIPT_DIR/../policies" \
    "${prefix:+$prefix/policies/opsbench/$team}" \
    "$HOME/.claude/policies/opsbench/team-incident-response"; do
    [[ -n "$c" && -f "$c/cedar/tools.cedar" ]] && { echo "$c"; return; }
  done
  # Last resort: source-repo relative path even if the file check above failed.
  echo "$SCRIPT_DIR/../policies"
}
POLICIES_DIR="$(resolve_policies_dir)"
TOOLS_POLICY="$POLICIES_DIR/cedar/tools.cedar"

# ----------------------------------------------------------------------------- stdin
INPUT="$(cat)"
if [[ -z "$INPUT" ]]; then
  echo "pre-tool-use: empty stdin — failing closed" >&2
  exit 2
fi
jqr() { printf '%s' "$INPUT" | jq -r "$1" 2>/dev/null; }

TOOL="$(jqr '.tool_name // "unknown-tool"')"
CWD="$(jqr '.cwd // empty')"; [[ -z "$CWD" ]] && CWD="$PWD"
TS="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
# tool params live under .tool_input (Claude Code), with .args/.input as legacy fallbacks.
TIN="$(printf '%s' "$INPUT" | jq -c '.tool_input // .args // .input // {}' 2>/dev/null)"
tin() { printf '%s' "$TIN" | jq -r "$1 // empty" 2>/dev/null; }

# ----------------------------------------------------------------------------- incident dir
INCIDENT_DIR=""
SEARCH="$CWD"
while [[ -n "$SEARCH" && "$SEARCH" != "/" ]]; do
  if [[ -f "$SEARCH/timeline.md" && -f "$SEARCH/custody.log" ]]; then INCIDENT_DIR="$SEARCH"; break; fi
  if [[ "$(basename "$SEARCH")" =~ ^(INC-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}|incident-.*)$ ]]; then INCIDENT_DIR="$SEARCH"; break; fi
  SEARCH="$(dirname "$SEARCH")"
done

# ----------------------------------------------------------------------------- agent identity
AGENT="${OPSBENCH_AGENT_NAME:-}"
[[ -z "$AGENT" ]] && AGENT="$(jqr '.agent_name // .subagent_name // empty')"
[[ -z "$AGENT" && -n "$INCIDENT_DIR" && -f "$INCIDENT_DIR/.opsbench-agent" ]] && AGENT="$(cat "$INCIDENT_DIR/.opsbench-agent" 2>/dev/null)"

# ----------------------------------------------------------------------------- classify action + resource
# Sets: ACTION, plus resource attrs RES_PATH/RES_NS/RES_CMDCLASS/RES_EXECUSER/RES_REPO.
ACTION="mcp::unknown"
RES_PATH=""; RES_NS=""; RES_CMDCLASS=""; RES_EXECUSER=""; RES_REPO=""
RES_ID="$TOOL"

classify_bash() {
  local cmd; cmd="$(tin '.command')"
  # filesystem redirects to a real file (ignore `2>` stderr and /dev/null sinks)
  local redir tgt
  redir="$(printf '%s' "$cmd" | grep -oE '[[:space:]]1?>>?[[:space:]]*[^[:space:]&|>]+' | tail -1)"
  if [[ -n "$redir" ]]; then
    tgt="$(printf '%s' "$redir" | sed -E 's/^[[:space:]]*1?>>?[[:space:]]*//')"
    if [[ "$tgt" != "/dev/null" ]]; then
      if printf '%s' "$redir" | grep -q '>>'; then ACTION="FS::append"; else ACTION="FS::write"; fi
      RES_PATH="$tgt"; return
    fi
  fi
  # ssh — classify by the remote command class
  if printf '%s' "$cmd" | grep -qE '(^|[^a-z])ssh([^a-z]|$)'; then
    local rotok mutok
    mutok="$(printf '%s' "$cmd" | grep -oiE '(^|[^a-z])(rm|dd|mkfs|systemctl|kill|reboot|iptables-restore|mount|umount|truncate)([^a-z]|$)' | grep -oiE 'rm|dd|mkfs|systemctl|kill|reboot|iptables-restore|mount|umount|truncate' | head -1)"
    rotok="$(printf '%s' "$cmd" | grep -oiE '(^|[^a-z])(journalctl|dmesg|iptables-save|ethtool|iostat|vmstat|lsof|free|df|ip|ss|ps)([^a-z]|$)' | grep -oiE 'journalctl|dmesg|iptables-save|ethtool|iostat|vmstat|lsof|free|df|ip|ss|ps' | head -1)"
    if [[ -n "$mutok" ]]; then ACTION="Bash::ssh::exec"; RES_CMDCLASS="$mutok";
    elif [[ -n "$rotok" ]]; then ACTION="Bash::ssh::readonly"; RES_CMDCLASS="$rotok";
    else ACTION="Bash::ssh::exec"; fi
    return
  fi
  # kubectl / oc
  if printf '%s' "$cmd" | grep -qE '(^|[^a-z])(kubectl|oc)([^a-z]|$)'; then
    RES_NS="$(printf '%s' "$cmd" | grep -oE '(-n|--namespace)[[:space:]]+[A-Za-z0-9_.-]+' | head -1 | awk '{print $2}')"
    printf '%s' "$cmd" | grep -qiE '(--as[[:space:]]+root|-u[[:space:]]+root|--user[[:space:]]+root)' && RES_EXECUSER="root"
    local sub; sub="$(printf '%s' "$cmd" | grep -oiE '(kubectl|oc)[[:space:]]+[a-z-]+' | head -1 | awk '{print $2}')"
    case "$sub" in
      get|list)            ACTION="k8s::get" ;;
      describe)            ACTION="k8s::describe" ;;
      logs|log)            ACTION="k8s::logs" ;;
      events|event)        ACTION="k8s::events" ;;
      scale)               ACTION="k8s::scale" ;;
      patch|edit|annotate|label|set) ACTION="k8s::patch" ;;
      apply|replace|rollout) ACTION="k8s::apply" ;;
      create|expose|run)   ACTION="k8s::create" ;;
      delete|del)          ACTION="k8s::delete" ;;
      exec)                ACTION="k8s::exec" ;;
      *)                   ACTION="k8s::get" ;;
    esac
    return
  fi
  # databases via CLI
  if printf '%s' "$cmd" | grep -qiE '(^|[^a-z])psql([^a-z]|$)'; then
    if printf '%s' "$cmd" | grep -qiE '\b(insert|update|delete|drop|truncate|alter|create)\b'; then ACTION="postgres::query::write"; else ACTION="postgres::query::readonly"; fi
    return
  fi
  if printf '%s' "$cmd" | grep -qiE 'clickhouse-client'; then
    if printf '%s' "$cmd" | grep -qiE '\b(insert|alter|drop|truncate)\b'; then ACTION="clickhouse::query::write"; else ACTION="clickhouse::query::readonly"; fi
    return
  fi
  # explicit filesystem mutations / hashing
  if printf '%s' "$cmd" | grep -qE '(^|[^a-z])(rm|unlink)([^a-z]|$)'; then ACTION="FS::delete"; RES_PATH="$(tin '.command')"; return; fi
  if printf '%s' "$cmd" | grep -qE '(^|[^a-z])(sha256sum|shasum)([^a-z]|$)'; then ACTION="FS::sha256"; return; fi
  if printf '%s' "$cmd" | grep -qiE '(^|[^a-z])libreoffice([^a-z]|$)'; then ACTION="Bash::libreoffice"; return; fi
  if printf '%s' "$cmd" | grep -qiE 'git[[:space:]]+push'; then
    ACTION="git::push"; printf '%s' "$cmd" | grep -qi 'witness' && RES_REPO="incident-witness"; return
  fi
  # other clearly-mutating shell verbs with no fine-grained action -> deny sink
  if printf '%s' "$cmd" | grep -qiE '(^|[^a-z])(dd|mkfs|helm|terraform|systemctl|mount|umount|iptables-restore|kill|reboot|chmod|chown|tee)([^a-z]|$)'; then
    ACTION="Bash::exec"; return
  fi
  # default: treat as a read command
  ACTION="Bash::read"
}

classify_mcp() {
  local t; t="$(printf '%s' "$TOOL" | tr '[:upper:]' '[:lower:]')"
  # namespace by server keyword, verb by tool-name keyword
  local mut=0
  printf '%s' "$t" | grep -qE '(delete|create|update|patch|scale|apply|write|exec|drop|truncate|restart|salvage|detach|reattach|post|send|trigger|publish|push)' && mut=1
  case "$t" in
    *k8s*|*kube*)
      if   printf '%s' "$t" | grep -q 'delete'; then ACTION="k8s::delete";
      elif printf '%s' "$t" | grep -q 'scale';  then ACTION="k8s::scale";
      elif printf '%s' "$t" | grep -qE 'patch|update|edit'; then ACTION="k8s::patch";
      elif printf '%s' "$t" | grep -qE 'apply|rollout'; then ACTION="k8s::apply";
      elif printf '%s' "$t" | grep -q 'create'; then ACTION="k8s::create";
      elif printf '%s' "$t" | grep -q 'exec';   then ACTION="k8s::exec";
      elif printf '%s' "$t" | grep -qE 'log';   then ACTION="k8s::logs";
      elif printf '%s' "$t" | grep -qE 'event'; then ACTION="k8s::events";
      else ACTION="k8s::get"; fi ;;
    *prom*)        ACTION="prometheus::query" ;;
    *loki*)        ACTION="loki::query" ;;
    *tempo*)       ACTION="tempo::search" ;;
    *otel*|*opentelemetry*) ACTION="otel::query" ;;
    *postgres*|*pg_*) [[ $mut -eq 1 ]] && ACTION="postgres::query::write" || ACTION="postgres::query::readonly" ;;
    *clickhouse*)  [[ $mut -eq 1 ]] && ACTION="clickhouse::query::write" || ACTION="clickhouse::query::readonly" ;;
    *redis*)       ACTION="redis::info" ;;
    *longhorn*)
      if   printf '%s' "$t" | grep -q 'salvage'; then ACTION="longhorn::salvage";
      elif printf '%s' "$t" | grep -q 'detach';  then ACTION="longhorn::detach";
      elif printf '%s' "$t" | grep -qE 'delete.*volume'; then ACTION="longhorn::delete-volume";
      elif printf '%s' "$t" | grep -qE 'delete.*replica'; then ACTION="longhorn::delete-replica";
      else ACTION="longhorn::volume-status"; fi ;;
    *azure*)       printf '%s' "$t" | grep -q 'audit' && ACTION="azure::audit-log" || ACTION="azure::describe" ;;
    *aws*)         printf '%s' "$t" | grep -q 'cloudtrail' && ACTION="aws::cloudtrail::lookup" || ACTION="aws::describe" ;;
    *slack*)       ACTION="slack::post" ;;
    *pagerduty*)   ACTION="pagerduty::trigger" ;;
    *linear*)      ACTION="linear::create" ;;
    *falco*)       ACTION="falco::events" ;;
    *grafana*)     ACTION="prometheus::query" ;;
    *)             [[ $mut -eq 1 ]] && ACTION="mcp::unknown" || ACTION="mcp::unknown" ;;
  esac
}

case "$TOOL" in
  Read|Glob|Grep|LS)    ACTION="FS::read";  RES_PATH="$(tin '.file_path')"; [[ -z "$RES_PATH" ]] && RES_PATH="$(tin '.path')" ;;
  Write)                ACTION="FS::write"; RES_PATH="$(tin '.file_path')" ;;
  Edit|MultiEdit)       ACTION="FS::write"; RES_PATH="$(tin '.file_path')" ;;
  NotebookEdit)         ACTION="FS::write"; RES_PATH="$(tin '.notebook_path')" ;;
  Task)                 ACTION="agent::dispatch" ;;
  Bash)                 classify_bash ;;
  mcp__*)               classify_mcp ;;
  *)                    ACTION="mcp::unknown" ;;
esac
[[ -n "$RES_PATH" ]] && RES_ID="$RES_PATH"

# mutation flag (for the timeline note only — authorization is Cedar's job)
IS_MUTATION="false"
case "$ACTION" in
  FS::write|FS::append|FS::delete|Bash::exec|Bash::ssh::exec|k8s::scale|k8s::patch|k8s::create|k8s::apply|k8s::delete|k8s::exec|postgres::query::write|clickhouse::query::write|postgres::truncate|postgres::drop|longhorn::salvage|longhorn::detach|longhorn::reattach|longhorn::delete-volume|longhorn::delete-replica|git::push|slack::post|email::send|pagerduty::trigger|statuspage::publish)
    IS_MUTATION="true" ;;
esac

# ----------------------------------------------------------------------------- context derivation
CTX_APPROVAL=""; CTX_VERDICT=""; CTX_STEP="${OPSBENCH_RECOVERY_STEP_ID:-}"; CTX_RISK="${OPSBENCH_RECOVERY_STEP_RISK:-}"
if [[ -n "$INCIDENT_DIR" ]]; then
  cur="$(find "$INCIDENT_DIR" -maxdepth 1 -type d -name 'round-*' -printf '%f\n' 2>/dev/null | sed 's/^round-//' | sort -n | tail -1)"
  if [[ -n "$cur" && -f "$INCIDENT_DIR/round-$cur/verdict.md" ]]; then
    CTX_VERDICT="$(grep -oE '(ROOT_CAUSE_CONFIRMED|NEED_MORE_EVIDENCE|INCONCLUSIVE)' "$INCIDENT_DIR/round-$cur/verdict.md" 2>/dev/null | head -1)"
  fi
fi
case "${OPSBENCH_HUMAN_APPROVAL:-}" in 1|true|TRUE|yes) CTX_APPROVAL="true" ;; esac
if [[ -z "$CTX_APPROVAL" && -n "$INCIDENT_DIR" ]]; then
  if grep -rslE '"decision"[[:space:]]*:[[:space:]]*"approved"' "$INCIDENT_DIR"/recovery/ "$INCIDENT_DIR"/round-*/ >/dev/null 2>&1; then CTX_APPROVAL="true"; fi
fi

# build context JSON (only set keys)
CONTEXT="$(jq -nc \
  --arg approval "$CTX_APPROVAL" --arg verdict "$CTX_VERDICT" --arg step "$CTX_STEP" --arg risk "$CTX_RISK" \
  '{}
   + (if $approval != "" then {human_approval: ($approval=="true")} else {} end)
   + (if $verdict  != "" then {verdict_status: $verdict} else {} end)
   + (if $step     != "" then {recovery_step_id: $step} else {} end)
   + (if $risk     != "" then {recovery_step_risk: $risk} else {} end)')"

# ----------------------------------------------------------------------------- audit + timeline helpers
record_audit() {
  printf '{"ts":"%s","agent":"%s","tool":"%s","action":"%s","mutation":%s,"resource":"%s","decision":"%s","reason":"%s"}\n' \
    "$TS" "$AGENT" "$TOOL" "$ACTION" "$IS_MUTATION" "$RES_ID" "$1" "$2" >> "$AUDIT_LOG" 2>/dev/null || true
}
note_mutation() {
  [[ "$IS_MUTATION" == "true" && -n "$INCIDENT_DIR" ]] || return 0
  # Single quotes are intentional: backticks/%s are literal markdown + printf placeholders.
  # shellcheck disable=SC2016
  { printf '\n### %s — MUTATION_AUTHORIZED — %s\n**Actor:** %s\n**Action:** %s on `%s`\n' \
      "$TS" "$AGENT" "$AGENT" "$ACTION" "$RES_ID"; } >> "$INCIDENT_DIR/timeline.md" 2>/dev/null || true
}
deny() { echo "pre-tool-use: DENIED — $1 (agent=$AGENT action=$ACTION resource=$RES_ID)" >&2; record_audit deny "$1"; exit 2; }
allow() { record_audit allow "$1"; note_mutation; exit 0; }

# ----------------------------------------------------------------------------- preconditions (fail closed)
if [[ -z "$AGENT" ]]; then
  deny "no-agent-identity" # cannot enforce per-agent policy without a principal
fi
if ! command -v "$CEDAR_BIN" >/dev/null 2>&1; then
  if [[ "$DEV_FAIL_OPEN" == "1" || "$DEV_FAIL_OPEN" == "true" ]]; then
    echo "pre-tool-use: cedar CLI '$CEDAR_BIN' not found — DEV FAIL-OPEN (set OPSBENCH_DEV_FAIL_OPEN=0 to enforce)." >&2
    record_audit "allow-dev" "cedar-missing-dev-fail-open"; note_mutation; exit 0
  fi
  deny "cedar-cli-missing" # install: cargo install cedar-policy-cli
fi
[[ -f "$TOOLS_POLICY" ]] || deny "policy-missing:$TOOLS_POLICY"
command -v jq >/dev/null 2>&1 || deny "jq-missing"

# ----------------------------------------------------------------------------- Cedar request
RES_ATTRS="$(jq -nc \
  --arg path "$RES_PATH" --arg ns "$RES_NS" --arg cc "$RES_CMDCLASS" --arg eu "$RES_EXECUSER" --arg repo "$RES_REPO" \
  '{}
   + (if $path != "" then {path: $path} else {} end)
   + (if $ns   != "" then {namespace: $ns} else {} end)
   + (if $cc   != "" then {command_class: $cc} else {} end)
   + (if $eu   != "" then {exec_user: $eu} else {} end)
   + (if $repo != "" then {repo: $repo} else {} end)')"

ENTITIES_JSON="$(jq -nc --arg agent "$AGENT" --arg rid "$RES_ID" --argjson attrs "$RES_ATTRS" \
  '[ {uid:{type:"Agent",id:$agent}, attrs:{}, parents:[]},
     {uid:{type:"Resource",id:$rid}, attrs:$attrs, parents:[]} ]')"

REQUEST_JSON="$(jq -nc --arg agent "$AGENT" --arg action "$ACTION" --arg rid "$RES_ID" --argjson ctx "$CONTEXT" \
  '{principal:{type:"Agent",id:$agent}, action:{type:"Action",id:$action}, resource:{type:"Resource",id:$rid}, context:$ctx}')"

TMP_REQ="$(mktemp)"; TMP_ENT="$(mktemp)"
printf '%s' "$REQUEST_JSON"  > "$TMP_REQ"
printf '%s' "$ENTITIES_JSON" > "$TMP_ENT"
trap 'rm -f "$TMP_REQ" "$TMP_ENT"' EXIT

DECISION_OUT="$("$CEDAR_BIN" authorize --policies "$TOOLS_POLICY" --entities "$TMP_ENT" --request-json "$TMP_REQ" 2>&1)"
CEDAR_RC=$?

if [[ $CEDAR_RC -ne 0 && $CEDAR_RC -ne 2 ]] && ! printf '%s' "$DECISION_OUT" | grep -qiE '\b(ALLOW|DENY)\b'; then
  # cedar errored (bad flags, parse error, etc.) — fail closed.
  echo "pre-tool-use: cedar error (rc=$CEDAR_RC): $DECISION_OUT" >&2
  deny "cedar-error"
fi

if printf '%s' "$DECISION_OUT" | grep -qiw ALLOW; then
  allow "cedar-permit"
else
  deny "cedar-forbid"
fi
