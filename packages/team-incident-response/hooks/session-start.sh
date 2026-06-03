#!/usr/bin/env bash
# hooks/session-start.sh — auto-inject incident context at SessionStart.
#
# Triggered on SessionStart, SessionStart:resume, SessionStart:compact.
# Reads JSON event from stdin:
#   { "session_type": "new"|"resume"|"compact", "cwd": "...", "session_id": "..." }
#
# Outputs context to stdout, which the harness prepends to the new session as a
# system message. Output is plain markdown.

set -uo pipefail

INPUT="$(cat)"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || echo "$PWD")"
SESSION_TYPE="$(printf '%s' "$INPUT" | jq -r '.session_type // "new"' 2>/dev/null || echo "new")"
[[ -z "$CWD" ]] && CWD="$PWD"

# ----- locate incident dir -----
INCIDENT_DIR=""
SEARCH="$CWD"
while [[ -n "$SEARCH" && "$SEARCH" != "/" ]]; do
  if [[ -f "$SEARCH/timeline.md" && -f "$SEARCH/custody.log" ]]; then
    INCIDENT_DIR="$SEARCH"; break
  fi
  if [[ "$(basename "$SEARCH")" =~ ^(INC-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}|incident-.*)$ ]]; then
    INCIDENT_DIR="$SEARCH"; break
  fi
  SEARCH="$(dirname "$SEARCH")"
done

[[ -z "$INCIDENT_DIR" ]] && exit 0  # not in an incident — no injection

# ----- gather state -----
INCIDENT_ID="$(basename "$INCIDENT_DIR")"
[[ ! "$INCIDENT_ID" =~ ^INC- ]] && INCIDENT_ID="$(grep -oE 'INC-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}' "$INCIDENT_DIR/timeline.md" 2>/dev/null | head -1)"

# Current round = highest round-N directory present
CURRENT_ROUND="$(find "$INCIDENT_DIR" -maxdepth 1 -type d -name 'round-*' -printf '%f\n' 2>/dev/null | sed 's/^round-//' | sort -n | tail -1 || echo "")"
[[ -z "$CURRENT_ROUND" ]] && CURRENT_ROUND="0 (no collection started)"

# Timeline last-modified
TL_PATH="$INCIDENT_DIR/timeline.md"
TL_MTIME="(missing)"
TL_LINES="0"
TL_LAST_ENTRY="(none)"
if [[ -f "$TL_PATH" ]]; then
  TL_MTIME="$(date -u -r "$TL_PATH" +'%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo unknown)"
  TL_LINES="$(wc -l < "$TL_PATH" | tr -d ' ')"
  TL_LAST_ENTRY="$(grep -E '^### [0-9]{4}-' "$TL_PATH" 2>/dev/null | tail -1 || echo '(none)')"
fi

# Custody log size + count
CUST_PATH="$INCIDENT_DIR/custody.log"
CUST_LINES="0"
CUST_SEALED="0"
if [[ -f "$CUST_PATH" ]]; then
  CUST_LINES="$(wc -l < "$CUST_PATH" | tr -d ' ')"
  CUST_SEALED="$(grep -c 'sealed' "$CUST_PATH" 2>/dev/null || echo 0)"
fi

# Verdict status (latest round)
VERDICT_STATUS="(no verdict yet)"
LATEST_VERDICT="$INCIDENT_DIR/round-${CURRENT_ROUND}/verdict.md"
if [[ -f "$LATEST_VERDICT" ]]; then
  VERDICT_STATUS="$(grep -oE '(ROOT_CAUSE_CONFIRMED|NEED_MORE_EVIDENCE|INCONCLUSIVE)' "$LATEST_VERDICT" 2>/dev/null | head -1 || echo unknown)"
fi

# Pending human-gate
PENDING_APPROVAL=""
if [[ -f "$INCIDENT_DIR/round-$((CURRENT_ROUND + 1))/request.md" ]]; then
  if grep -q '"decision":[[:space:]]*"pending"' "$INCIDENT_DIR/round-$((CURRENT_ROUND + 1))/request.md" 2>/dev/null; then
    PENDING_APPROVAL="YES — round-$((CURRENT_ROUND + 1))/request.md awaits approval"
  fi
fi

# ----- emit injection -----
cat <<EOF
## incident-state (auto-injected)

**Session type:** ${SESSION_TYPE}
**Incident dir:** \`${INCIDENT_DIR}\`
**Incident ID:** ${INCIDENT_ID:-unknown}
**Current round:** ${CURRENT_ROUND}
**Latest verdict status:** ${VERDICT_STATUS}

**Timeline:**
- Path: \`${TL_PATH#"$INCIDENT_DIR"/}\`
- Last modified (UTC): ${TL_MTIME}
- Total lines: ${TL_LINES}
- Last entry: ${TL_LAST_ENTRY}

**Custody:**
- Lines: ${CUST_LINES}
- Sealed bundles: ${CUST_SEALED}

EOF

if [[ -n "$PENDING_APPROVAL" ]]; then
  echo "**Human approval pending:** ${PENDING_APPROVAL}"
  echo
fi

cat <<'EOF'
**Rules (auto-recall):**
- Append-only to timeline.md and custody.log
- No recovery actions without ROOT_CAUSE_CONFIRMED verdict or explicit human override
- Every causal claim cites a sha256-sealed evidence file
- See \`policies/constitution.md\` for full authoring rules
EOF
