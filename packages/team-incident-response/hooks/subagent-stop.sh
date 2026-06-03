#!/usr/bin/env bash
# hooks/subagent-stop.sh — capture subagent completion, update progress ledger, critique outputs.
#
# Reads JSON event from stdin:
#   { "agent_name": "...", "status": "ok"|"error"|"timeout",
#     "output_summary": "...", "artifacts": [{"path": "..."}, ...],
#     "session_id": "...", "cwd": "..." }
#
# Side effects:
#   - Writes structured trace JSON to <incident_dir>/traces/<ts>-<agent>.json
#   - Updates <incident_dir>/progress-ledger.json
#   - Emits critique to stderr (visible to next agent) if required fields missing
#
# Exit 0 always.

set -uo pipefail

INPUT="$(cat)"
[[ -z "$INPUT" ]] && exit 0

AGENT="$(printf '%s' "$INPUT" | jq -r '.agent_name // .subagent_name // "unknown"')"
STATUS="$(printf '%s' "$INPUT" | jq -r '.status // "unknown"')"
SUMMARY="$(printf '%s' "$INPUT" | jq -r '.output_summary // ""')"
ARTIFACTS="$(printf '%s' "$INPUT" | jq -c '.artifacts // []')"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty')"
TS="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
TS_FILE="$(date -u +'%Y%m%dT%H%M%SZ')"

# locate incident dir
INCIDENT_DIR=""
SEARCH="${CWD:-$PWD}"
while [[ -n "$SEARCH" && "$SEARCH" != "/" ]]; do
  if [[ -f "$SEARCH/timeline.md" && -f "$SEARCH/custody.log" ]]; then
    INCIDENT_DIR="$SEARCH"; break
  fi
  if [[ "$(basename "$SEARCH")" =~ ^(INC-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}|incident-.*)$ ]]; then
    INCIDENT_DIR="$SEARCH"; break
  fi
  SEARCH="$(dirname "$SEARCH")"
done

[[ -z "$INCIDENT_DIR" ]] && exit 0

# ----- write trace -----
TRACE_DIR="$INCIDENT_DIR/traces"
mkdir -p "$TRACE_DIR" 2>/dev/null || true
TRACE_FILE="$TRACE_DIR/${TS_FILE}-${AGENT}.json"

jq -n \
  --arg ts "$TS" \
  --arg agent "$AGENT" \
  --arg status "$STATUS" \
  --arg summary "$SUMMARY" \
  --argjson artifacts "$ARTIFACTS" \
  '{
    timestamp_utc: $ts,
    agent: $agent,
    status: $status,
    summary: $summary,
    artifacts: $artifacts
  }' > "$TRACE_FILE" 2>/dev/null || true

# ----- update progress ledger -----
LEDGER="$INCIDENT_DIR/progress-ledger.json"
if [[ ! -f "$LEDGER" ]]; then
  printf '{"updated_at_utc":"%s","agents":{}}\n' "$TS" > "$LEDGER"
fi

TMP_LEDGER="$(mktemp)"
if jq --arg ts "$TS" \
   --arg agent "$AGENT" \
   --arg status "$STATUS" \
   --arg trace "$TRACE_FILE" \
   --argjson artifacts "$ARTIFACTS" \
   '
   .updated_at_utc = $ts |
   .agents[$agent] = {
     last_seen_utc: $ts,
     last_status: $status,
     last_trace: $trace,
     artifact_count: ($artifacts | length),
     runs: ((.agents[$agent].runs // 0) + 1)
   }
   ' "$LEDGER" > "$TMP_LEDGER" 2>/dev/null; then
  mv "$TMP_LEDGER" "$LEDGER"
else
  rm -f "$TMP_LEDGER"
fi

# ----- critique authored artifacts -----
# Required-fields check, per agent class
critique() {
  local file="$1"
  [[ ! -f "$file" ]] && return 0

  case "$AGENT" in
    hypothesis-*)
      for k in hypothesis_id status confidence evidence_for evidence_against confirm_criteria falsify_criteria falsify_attempts; do
        if ! grep -q "\"$k\"\|^${k}:\|^\*\*${k}" "$file" 2>/dev/null; then
          echo "subagent-stop critique: $AGENT artifact $file missing required field: $k" >&2
        fi
      done
      ;;
    forensic-synthesizer|verdict-arbiter)
      for k in status governor_check hypotheses_evaluated parent_evidence_bundle_sha256; do
        if ! grep -q "\"$k\"\|^${k}:\|^\*\*${k}" "$file" 2>/dev/null; then
          echo "subagent-stop critique: $AGENT verdict $file missing required field: $k" >&2
        fi
      done
      ;;
    evidence-requester)
      for k in artifacts hypotheses human_approval governor_check staleness_deadline_utc; do
        if ! grep -q "\"$k\"\|^${k}:\|^\*\*${k}" "$file" 2>/dev/null; then
          echo "subagent-stop critique: $AGENT request $file missing required field: $k" >&2
        fi
      done
      ;;
    rca-author)
      for k in why_chain final_root_cause evidence_attestation; do
        if ! grep -q "\"$k\"\|^${k}:\|^## ${k}\|^\*\*${k}" "$file" 2>/dev/null; then
          echo "subagent-stop critique: rca-author $file missing required section: $k" >&2
        fi
      done
      ;;
    incident-report-author)
      for k in severity detection timeline impact response_actions recovery lessons_learned; do
        if ! grep -qi "\"$k\"\|^${k}:\|^## ${k}\|^\*\*${k}" "$file" 2>/dev/null; then
          echo "subagent-stop critique: incident-report-author $file missing required section: $k" >&2
        fi
      done
      ;;
    recovery-planner)
      for k in steps prerequisites human_approval based_on_verdict_sha256; do
        if ! grep -q "\"$k\"\|^${k}:\|^\*\*${k}" "$file" 2>/dev/null; then
          echo "subagent-stop critique: recovery-planner $file missing required field: $k" >&2
        fi
      done
      ;;
  esac
}

# Iterate artifacts
echo "$ARTIFACTS" | jq -r '.[].path // empty' 2>/dev/null | while IFS= read -r p; do
  [[ -n "$p" ]] && critique "$p"
done

exit 0
