#!/usr/bin/env bash
# hooks/lib/governor-check.sh — evaluate governors.cedar for a loop / recovery transition.
#
# Governors are NOT per-tool-call decisions; they gate orchestration transitions at round
# boundaries (max rounds, per-round artifact budgets, wall-clock cap, falsification
# requirement, human approval, the recovery gate, staleness). The orchestrator / skill calls
# this helper BEFORE starting a new round, dispatching collection, authoring finals, or
# executing recovery, and aborts the transition on a non-zero exit.
#
# Usage:
#   governor-check.sh --action <loop::new_round|loop::dispatch_collection|loop::author_final
#                              |loop::dispatch_recovery|recovery::execute|loop::extend_wall_clock>
#                     [--agent <agent-name>]        (default: incident-commander)
#                     [--incident <incident-id>]    (default: active)
#                     --context <file.json|->       (LoopContext; '-' reads stdin)
#
# The caller is responsible for supplying a COMPLETE LoopContext; any cap whose required field
# is absent will not fire (fail-open for THAT cap), so missing-field completeness is the
# caller's contract. now_utc / staleness_deadline_utc may be plain ISO-8601 strings — this
# helper wraps them as Cedar datetime values.
#
# Exit 0 = allow (transition may proceed), 2 = deny (blocked), other = error (treat as deny).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CEDAR_BIN="${OPSBENCH_CEDAR_BIN:-cedar}"
DEV_FAIL_OPEN="${OPSBENCH_DEV_FAIL_OPEN:-0}"
AUDIT_LOG="${OPSBENCH_AUDIT_LOG:-/tmp/opsbench-governor-check.jsonl}"

ACTION=""; AGENT="incident-commander"; INCIDENT="active"; CTX_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --action)   ACTION="${2:?}"; shift 2 ;;
    --agent)    AGENT="${2:?}"; shift 2 ;;
    --incident) INCIDENT="${2:?}"; shift 2 ;;
    --context)  CTX_FILE="${2:?}"; shift 2 ;;
    -h|--help)  grep -E '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "governor-check: unknown arg: $1" >&2; exit 64 ;;
  esac
done
[[ -n "$ACTION" ]] || { echo "governor-check: --action is required" >&2; exit 64; }

resolve_policies_dir() {
  if [[ -n "${OPSBENCH_POLICIES_DIR:-}" ]]; then echo "$OPSBENCH_POLICIES_DIR"; return; fi
  local c
  for c in \
    "$SCRIPT_DIR/../../policies" \
    "$SCRIPT_DIR/../policies" \
    "$HOME/.claude/policies/opsbench/team-incident-response"; do
    [[ -f "$c/governors.cedar" ]] && { echo "$c"; return; }
  done
  echo "$SCRIPT_DIR/../../policies"
}
POLICIES_DIR="$(resolve_policies_dir)"
GOVERNORS_POLICY="$POLICIES_DIR/governors.cedar"
TS="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

audit() { printf '{"ts":"%s","agent":"%s","action":"%s","incident":"%s","decision":"%s","reason":"%s"}\n' \
  "$TS" "$AGENT" "$ACTION" "$INCIDENT" "$1" "$2" >> "$AUDIT_LOG" 2>/dev/null || true; }
deny() { echo "governor-check: DENIED — $1 (agent=$AGENT action=$ACTION)" >&2; audit deny "$1"; exit 2; }
allow() { audit allow "$1"; exit 0; }

command -v jq >/dev/null 2>&1 || deny "jq-missing"
if ! command -v "$CEDAR_BIN" >/dev/null 2>&1; then
  if [[ "$DEV_FAIL_OPEN" == "1" || "$DEV_FAIL_OPEN" == "true" ]]; then
    echo "governor-check: cedar CLI '$CEDAR_BIN' not found — DEV FAIL-OPEN." >&2; audit allow-dev "cedar-missing-dev-fail-open"; exit 0
  fi
  deny "cedar-cli-missing"
fi
[[ -f "$GOVERNORS_POLICY" ]] || deny "policy-missing:$GOVERNORS_POLICY"

# read raw context
RAW="{}"
if [[ -n "$CTX_FILE" ]]; then
  if [[ "$CTX_FILE" == "-" ]]; then RAW="$(cat)"; else RAW="$(cat "$CTX_FILE" 2>/dev/null || echo '{}')"; fi
fi
printf '%s' "$RAW" | jq -e . >/dev/null 2>&1 || deny "bad-context-json"

# wrap ISO timestamps as Cedar datetime extension values
CONTEXT="$(printf '%s' "$RAW" | jq -c '
  (if has("now_utc") and (.now_utc|type=="string") then .now_utc = {"__extn":{"fn":"datetime","arg":.now_utc}} else . end)
  | (if has("staleness_deadline_utc") and (.staleness_deadline_utc|type=="string") then .staleness_deadline_utc = {"__extn":{"fn":"datetime","arg":.staleness_deadline_utc}} else . end)
')"

ENTITIES_JSON="$(jq -nc --arg agent "$AGENT" --arg inc "$INCIDENT" \
  '[ {uid:{type:"Agent",id:$agent}, attrs:{}, parents:[]},
     {uid:{type:"Incident",id:$inc}, attrs:{}, parents:[]} ]')"
REQUEST_JSON="$(jq -nc --arg agent "$AGENT" --arg action "$ACTION" --arg inc "$INCIDENT" --argjson ctx "$CONTEXT" \
  '{principal:{type:"Agent",id:$agent}, action:{type:"Action",id:$action}, resource:{type:"Incident",id:$inc}, context:$ctx}')"

TMP_REQ="$(mktemp)"; TMP_ENT="$(mktemp)"
printf '%s' "$REQUEST_JSON"  > "$TMP_REQ"
printf '%s' "$ENTITIES_JSON" > "$TMP_ENT"
trap 'rm -f "$TMP_REQ" "$TMP_ENT"' EXIT

OUT="$("$CEDAR_BIN" authorize --policies "$GOVERNORS_POLICY" --entities "$TMP_ENT" --request-json "$TMP_REQ" 2>&1)"
RC=$?
if [[ $RC -ne 0 && $RC -ne 2 ]] && ! printf '%s' "$OUT" | grep -qiE '\b(ALLOW|DENY)\b'; then
  echo "governor-check: cedar error (rc=$RC): $OUT" >&2; deny "cedar-error"
fi
if printf '%s' "$OUT" | grep -qiw ALLOW; then allow "governor-permit"; else deny "governor-forbid"; fi
