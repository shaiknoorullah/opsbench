#!/usr/bin/env bash
# hooks/pre-tool-use.sh — Cedar authorization for the 33 k8s-incident-response subagents.
#
# Invoked by Claude Code harness before any tool call. Reads JSON event from stdin:
#   { "agent_name": "...", "tool_name": "...", "args": {...}, "session_id": "...", "cwd": "..." }
#
# Exit 0  = allow
# Exit 2  = deny (stderr reason surfaces back to the agent)
# Exit !=0,!=2 = harness error (fail-closed at orchestrator level)
#
# Side effects:
#   - On any mutation, appends a MUTATION_PROPOSED entry to <incident_dir>/timeline.md
#     (if an incident dir is detected in cwd).
#   - Logs every decision to /tmp/k8s-incident-pre-tool-use.jsonl for audit.

set -euo pipefail

POLICIES_DIR="${K8S_INCIDENT_POLICIES_DIR:-$HOME/work/k8s-incident-response-skills/policies}"
TOOLS_POLICY="${POLICIES_DIR}/cedar/tools.cedar"
AUDIT_LOG="/tmp/k8s-incident-pre-tool-use.jsonl"
DEV_FAIL_OPEN="${K8S_INCIDENT_DEV_FAIL_OPEN:-true}"

# ----- read stdin -----
INPUT="$(cat)"
if [[ -z "$INPUT" ]]; then
  echo "pre-tool-use: empty stdin — allowing" >&2
  exit 0
fi

AGENT="$(printf '%s' "$INPUT" | jq -r '.agent_name // .subagent_name // "unknown-agent"')"
TOOL="$(printf '%s' "$INPUT"  | jq -r '.tool_name // "unknown-tool"')"
CWD="$(printf '%s' "$INPUT"   | jq -r '.cwd // empty')"
TS="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

# ----- detect incident dir -----
INCIDENT_DIR=""
SEARCH="${CWD:-$PWD}"
while [[ -n "$SEARCH" && "$SEARCH" != "/" ]]; do
  if [[ -f "$SEARCH/timeline.md" && -f "$SEARCH/custody.log" ]]; then
    INCIDENT_DIR="$SEARCH"
    break
  fi
  # Match INC-YYYY-MM-DD-NNN or incident-* layouts
  if [[ "$(basename "$SEARCH")" =~ ^(INC-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}|incident-.*)$ ]]; then
    INCIDENT_DIR="$SEARCH"
    break
  fi
  SEARCH="$(dirname "$SEARCH")"
done

# ----- classify action -----
# Map Claude Code tool names to Cedar action namespace
case "$TOOL" in
  Bash)            ACTION_NS="Bash" ;;
  Edit|Write|MultiEdit) ACTION_NS="FS::write" ;;
  Read|Glob|Grep|LS) ACTION_NS="FS::read" ;;
  mcp__*k8s*)      ACTION_NS="k8s" ;;
  mcp__*prom*)     ACTION_NS="prometheus" ;;
  mcp__*loki*)     ACTION_NS="loki" ;;
  mcp__*clickhouse*) ACTION_NS="clickhouse" ;;
  mcp__*postgres*) ACTION_NS="postgres" ;;
  mcp__*azure*)    ACTION_NS="azure" ;;
  mcp__*aws*)      ACTION_NS="aws" ;;
  mcp__*github*)   ACTION_NS="github" ;;
  mcp__*slack*)    ACTION_NS="slack" ;;
  *)               ACTION_NS="other" ;;
esac

IS_MUTATION="false"
case "$TOOL" in
  Edit|Write|MultiEdit) IS_MUTATION="true" ;;
  Bash)
    BASH_CMD="$(printf '%s' "$INPUT" | jq -r '.args.command // .input.command // ""')"
    if echo "$BASH_CMD" | grep -qE '\b(rm|dd|mkfs|kubectl[[:space:]]+(delete|patch|scale|apply|create|edit|exec)|psql.*-c.*"(DROP|TRUNCATE|DELETE|UPDATE|INSERT)"|systemctl[[:space:]]+(stop|restart|disable)|iptables-restore|salvage)\b'; then
      IS_MUTATION="true"
    fi
    ;;
  mcp__*write*|mcp__*delete*|mcp__*patch*|mcp__*create*|mcp__*scale*) IS_MUTATION="true" ;;
esac

# ----- audit log entry -----
record_audit() {
  local decision="$1" reason="$2"
  printf '{"ts":"%s","agent":"%s","tool":"%s","action_ns":"%s","mutation":%s,"incident_dir":"%s","decision":"%s","reason":"%s"}\n' \
    "$TS" "$AGENT" "$TOOL" "$ACTION_NS" "$IS_MUTATION" "$INCIDENT_DIR" "$decision" "$reason" \
    >> "$AUDIT_LOG"
}

# ----- timeline mutation note -----
note_mutation() {
  [[ -z "$INCIDENT_DIR" ]] && return 0
  [[ "$IS_MUTATION" != "true" ]] && return 0
  {
    printf '\n### %s — MUTATION_PROPOSED — %s\n' "$TS" "$AGENT"
    printf '**Actor:** %s\n' "$AGENT"
    printf '**Tool:** %s\n' "$TOOL"
    printf '**Pending Cedar decision**\n'
  } >> "$INCIDENT_DIR/timeline.md" 2>/dev/null || true
}

# ----- invoke Cedar -----
# We use cedar-cli if available. Otherwise dev fail-open with stderr warning.
if ! command -v cedar >/dev/null 2>&1; then
  if [[ "$DEV_FAIL_OPEN" == "true" ]]; then
    echo "pre-tool-use: cedar-cli not found — DEV FAIL-OPEN. Install: cargo install cedar-policy-cli" >&2
    record_audit "allow-dev" "cedar-cli missing"
    note_mutation
    exit 0
  else
    echo "pre-tool-use: cedar-cli not found and DEV_FAIL_OPEN=false — denying" >&2
    record_audit "deny" "cedar-cli missing"
    exit 2
  fi
fi

if [[ ! -f "$TOOLS_POLICY" ]]; then
  echo "pre-tool-use: policy file missing: $TOOLS_POLICY" >&2
  record_audit "deny" "policy-missing"
  exit 2
fi

# Build Cedar entities + request JSON
ENTITIES_JSON="$(jq -n --arg agent "User::\"$AGENT\"" '[{uid: {type: "User", id: $agent}, attrs: {}, parents: []}]')"
REQUEST_JSON="$(jq -n \
  --arg p "User::\"$AGENT\"" \
  --arg a "Action::\"$ACTION_NS\"" \
  --arg r "Resource::\"$TOOL\"" \
  '{principal: $p, action: $a, resource: $r, context: {}}')"

TMP_REQ="$(mktemp)"
TMP_ENT="$(mktemp)"
printf '%s' "$REQUEST_JSON"  > "$TMP_REQ"
printf '%s' "$ENTITIES_JSON" > "$TMP_ENT"

DECISION="$(cedar authorize \
  --policies "$TOOLS_POLICY" \
  --entities "$TMP_ENT" \
  --request-json "$TMP_REQ" 2>/dev/null || echo "deny")"

rm -f "$TMP_REQ" "$TMP_ENT"

if echo "$DECISION" | grep -qi "allow"; then
  record_audit "allow" "cedar-permit"
  note_mutation
  exit 0
else
  echo "pre-tool-use: DENIED by Cedar policy" >&2
  echo "  agent=$AGENT tool=$TOOL action_ns=$ACTION_NS" >&2
  echo "  See $TOOLS_POLICY for the permit rules covering this principal." >&2
  record_audit "deny" "cedar-forbid"
  exit 2
fi
