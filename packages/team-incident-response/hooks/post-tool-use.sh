#!/usr/bin/env bash
# hooks/post-tool-use.sh — chain-of-custody + timeline append after every tool call.
#
# Reads JSON event from stdin:
#   { "agent_name": "...", "tool_name": "...", "exit_code": 0,
#     "output_path": "/path/to/file" | null, "session_id": "...", "cwd": "..." }
#
# Side effects:
#   - If output_path is set and the file exists: compute sha256 and append a custody.log line.
#   - Append a timeline.md entry with the category derived from the agent phase.
#   - If the file is an authored artifact (final/*, round-*/verdict.md), queue a
#     schema-validator invocation for the next turn (writes a marker file the
#     orchestrator polls).
#
# Exit 0 always (this hook is informational; failures must not block tool execution).

set -uo pipefail

AUDIT_LOG="/tmp/k8s-incident-post-tool-use.jsonl"
VALIDATION_QUEUE="/tmp/k8s-incident-schema-validate.queue"

INPUT="$(cat)"
[[ -z "$INPUT" ]] && exit 0

AGENT="$(printf '%s' "$INPUT" | jq -r '.agent_name // .subagent_name // "unknown-agent"')"
TOOL="$(printf '%s' "$INPUT"  | jq -r '.tool_name // "unknown-tool"')"
EXIT_CODE="$(printf '%s' "$INPUT" | jq -r '.exit_code // 0')"
OUTPUT_PATH="$(printf '%s' "$INPUT" | jq -r '.output_path // empty')"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty')"
TS="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

# Resolve incident dir
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

# Try to detect outputs from Bash tool that wrote files (best-effort)
if [[ -z "$OUTPUT_PATH" && "$TOOL" == "Bash" ]]; then
  BASH_CMD="$(printf '%s' "$INPUT" | jq -r '.args.command // .input.command // ""')"
  if [[ -n "$BASH_CMD" ]]; then
    # Match >  /path or >> /path
    OUTPUT_PATH="$(echo "$BASH_CMD" | grep -oE '>>?[[:space:]]*[^[:space:]]+' | tail -1 | sed -E 's/^>>?[[:space:]]*//' || true)"
  fi
fi

# ----- derive timeline category from agent + phase -----
derive_category() {
  local a="$1"
  case "$a" in
    incident-commander)          echo "RESPONSE_BEGAN" ;;
    role-assigner)               echo "ROLE_ASSIGNED" ;;
    scribe)                      echo "EXTERNAL_EVENT" ;;
    comms-drafter)               echo "COMMS_SENT" ;;
    quarantine-coordinator)      echo "QUARANTINE" ;;
    evidence-source-discoverer)  echo "DISCOVERY" ;;
    evidence-collection-orchestrator) echo "COLLECTION_STARTED" ;;
    collector-*)                 echo "COLLECTION_COMPLETED" ;;
    evidence-cataloger|custody-attester|manifest-sealer) echo "EXTERNAL_EVENT" ;;
    hypothesis-*)                echo "HYPOTHESIS_VERDICT" ;;
    forensic-synthesizer|verdict-arbiter) echo "ROUND_VERDICT" ;;
    evidence-requester)          echo "EVIDENCE_REQUESTED" ;;
    human-gate)                  echo "HUMAN_APPROVAL" ;;
    recovery-planner)            echo "EXTERNAL_EVENT" ;;
    recovery-executor)           echo "RECOVERY_STEP" ;;
    recovery-verifier)           echo "RECOVERY_COMPLETED" ;;
    rca-author|incident-report-author|mitigation-author|pdf-renderer) echo "EXTERNAL_EVENT" ;;
    *)                           echo "EXTERNAL_EVENT" ;;
  esac
}
CATEGORY="$(derive_category "$AGENT")"

# ----- compute sha256 + append custody.log -----
SHA256=""
if [[ -n "$OUTPUT_PATH" && -f "$OUTPUT_PATH" ]]; then
  SHA256="$(sha256sum "$OUTPUT_PATH" 2>/dev/null | awk '{print $1}')"
  if [[ -n "$SHA256" && -n "$INCIDENT_DIR" ]]; then
    # path relative to incident dir if possible
    REL_PATH="$OUTPUT_PATH"
    if [[ "$OUTPUT_PATH" == "$INCIDENT_DIR"/* ]]; then
      REL_PATH="${OUTPUT_PATH#"$INCIDENT_DIR"/}"
    fi
    printf '%s | %s | collected | %s | sha256=%s\n' \
      "$TS" "$AGENT" "$REL_PATH" "$SHA256" \
      >> "$INCIDENT_DIR/custody.log"
  fi
fi

# ----- append timeline entry -----
# Single quotes around printf format strings are intentional: backticks are
# literal markdown delimiters, %s are positional substitutions — not shell expansions.
# shellcheck disable=SC2016
if [[ -n "$INCIDENT_DIR" ]]; then
  {
    printf '\n### %s — %s — %s\n' "$TS" "$CATEGORY" "$AGENT"
    printf '**Actor:** %s\n' "$AGENT"
    printf '**Event:** Tool `%s` exited %s' "$TOOL" "$EXIT_CODE"
    if [[ -n "$OUTPUT_PATH" ]]; then
      printf '; output: `%s`' "$OUTPUT_PATH"
    fi
    printf '\n'
    if [[ -n "$SHA256" ]]; then
      printf '**Evidence:**\n- `%s` (sha256=%s)\n' "${OUTPUT_PATH#"$INCIDENT_DIR"/}" "$SHA256"
    fi
  } >> "$INCIDENT_DIR/timeline.md" 2>/dev/null || true
fi

# ----- queue schema validation for authored artifacts -----
if [[ -n "$OUTPUT_PATH" ]]; then
  case "$OUTPUT_PATH" in
    */final/*.md|*/final/*.json|*/round-*/verdict.md|*/round-*/request.md|*/round-*/hypotheses/*.md|*/recovery/plan.*)
      printf '%s\t%s\t%s\n' "$TS" "$AGENT" "$OUTPUT_PATH" >> "$VALIDATION_QUEUE"
      ;;
  esac
fi

# ----- audit -----
printf '{"ts":"%s","agent":"%s","tool":"%s","exit":%s,"output_path":"%s","sha256":"%s","incident_dir":"%s"}\n' \
  "$TS" "$AGENT" "$TOOL" "$EXIT_CODE" "$OUTPUT_PATH" "$SHA256" "$INCIDENT_DIR" \
  >> "$AUDIT_LOG" 2>/dev/null || true

exit 0
