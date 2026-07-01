#!/usr/bin/env bash
# Test double for the `cedar` CLI, used by pre-tool-use.bats.
#
# Mimics `cedar authorize --policies P --entities E --request-json R`:
#   - copies the request JSON to $CEDAR_CAPTURE and entities to $CEDAR_CAPTURE_ENT (if set)
#     so tests can assert the request shape the hook built.
#   - prints a canned decision from $CEDAR_STUB_DECISION (default ALLOW).
#   - exits 0 for ALLOW and 2 for DENY, matching the real CLI's decision exit codes.
#
# It deliberately does NOT evaluate policies — policy *decisions* are verified separately
# against the real Cedar engine in policies/cedar/validate.mjs.
set -uo pipefail

req=""; ent=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    authorize)       shift ;;
    --request-json)  req="${2:-}"; shift 2 ;;
    --entities)      ent="${2:-}"; shift 2 ;;
    --policies|--schema) shift 2 ;;
    *)               shift ;;
  esac
done

[[ -n "${CEDAR_CAPTURE:-}"     && -n "$req" ]] && cp "$req" "$CEDAR_CAPTURE"
[[ -n "${CEDAR_CAPTURE_ENT:-}" && -n "$ent" ]] && cp "$ent" "$CEDAR_CAPTURE_ENT"

dec="${CEDAR_STUB_DECISION:-ALLOW}"
echo "$dec"
[[ "$dec" == "ALLOW" ]] && exit 0 || exit 2
