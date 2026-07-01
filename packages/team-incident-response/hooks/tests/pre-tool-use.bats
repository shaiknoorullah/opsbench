#!/usr/bin/env bats
# Tests for hooks/pre-tool-use.sh — the Cedar authorization gate.
#
# These assert the hook's LOGIC: tool->action classification, resource-attribute and context
# extraction, exit-code mapping (ALLOW->0, DENY->2), and fail-closed behaviour. They use a
# stub `cedar` (stub-cedar.sh) that captures the request and returns a canned decision, so the
# suite runs anywhere without the cedar engine. Policy DECISIONS are verified against the real
# Cedar engine in ../../policies/cedar/validate.mjs.

setup() {
  HOOK="$BATS_TEST_DIRNAME/../pre-tool-use.sh"
  STUB="$BATS_TEST_DIRNAME/stub-cedar.sh"
  POL="$BATS_TEST_DIRNAME/../../policies"
  TMP="$BATS_TEST_TMPDIR"
  CAP="$TMP/request.json"

  # confirmed-verdict incident fixture
  INC="$TMP/INC-2026-06-26-001"
  mkdir -p "$INC/round-1"
  : > "$INC/timeline.md"; : > "$INC/custody.log"
  echo "status: ROOT_CAUSE_CONFIRMED" > "$INC/round-1/verdict.md"

  ENT="$TMP/entities.json"
  export OPSBENCH_CEDAR_BIN="$STUB"
  export OPSBENCH_POLICIES_DIR="$POL"
  export OPSBENCH_AUDIT_LOG="$TMP/audit.jsonl"
  export CEDAR_CAPTURE="$CAP"
  export CEDAR_CAPTURE_ENT="$ENT"
}

# Run the hook for (agent, cwd, tool, tool_input_json) on stdin.
invoke() {
  local agent="$1" cwd="$2" tool="$3" tin="$4"
  local ev
  ev="$(jq -nc --arg t "$tool" --arg c "$cwd" --argjson ti "$tin" \
        '{tool_name:$t, cwd:$c, tool_input:$ti, hook_event_name:"PreToolUse"}')"
  OPSBENCH_AGENT_NAME="$agent" bash "$HOOK" <<<"$ev"
}
# jq the captured request the hook handed to cedar
cap() { jq -r "$1" "$CAP"; }
# read an attribute of the captured Resource entity (attrs live in the entities file, not the request)
res() { jq -r --arg k "$1" '.[] | select(.uid.type=="Resource") | .attrs[$k] // empty' "$ENT"; }

# ---------------------------------------------------------------- action classification
@test "Edit -> FS::write with file path as resource" {
  run invoke incident-commander "$INC" Edit '{"file_path":"/x/round-1/notes.md"}'
  [ "$status" -eq 0 ]
  [ "$(cap '.action.id')" = "FS::write" ]
  [ "$(cap '.resource.id')" = "/x/round-1/notes.md" ]
}

@test "Read -> FS::read" {
  run invoke incident-commander "$INC" Read '{"file_path":"/x/a"}'
  [ "$(cap '.action.id')" = "FS::read" ]
}

@test "Task -> agent::dispatch" {
  run invoke incident-commander "$INC" Task '{"subagent_type":"x"}'
  [ "$(cap '.action.id')" = "agent::dispatch" ]
}

@test "Bash kubectl scale -> k8s::scale + namespace attr" {
  run invoke quarantine-coordinator "$INC" Bash '{"command":"kubectl scale deploy/app --replicas=0 -n pnats"}'
  [ "$(cap '.action.id')" = "k8s::scale" ]
  [ "$(res namespace)" = "pnats" ]
}

@test "Bash kubectl get with 2>/dev/null is a read, not a write" {
  run invoke controlplane-collector "$INC" Bash '{"command":"kubectl get pods -n pnats 2>/dev/null"}'
  [ "$(cap '.action.id')" = "k8s::get" ]
}

@test "Bash ssh journalctl -> Bash::ssh::readonly + command_class" {
  run invoke node-collector "$INC" Bash '{"command":"ssh node1 journalctl -k --no-pager"}'
  [ "$(cap '.action.id')" = "Bash::ssh::readonly" ]
  [ "$(res command_class)" = "journalctl" ]
}

@test "Bash ssh rm -> Bash::ssh::exec + command_class rm" {
  run invoke node-collector "$INC" Bash '{"command":"ssh node1 rm -rf /var/log/x"}'
  [ "$(cap '.action.id')" = "Bash::ssh::exec" ]
  [ "$(res command_class)" = "rm" ]
}

@test "Bash rm -> FS::delete" {
  run invoke incident-commander "$INC" Bash '{"command":"rm -f /tmp/x"}'
  [ "$(cap '.action.id')" = "FS::delete" ]
}

@test "Bash redirect to a file -> FS::write with the target path" {
  run invoke controlplane-collector "$INC" Bash '{"command":"kubectl get pods > /x/round-1/evidence/pods.txt"}'
  [ "$(cap '.action.id')" = "FS::write" ]
  [ "$(cap '.resource.id')" = "/x/round-1/evidence/pods.txt" ]
}

@test "Bash kubectl exec --as root sets exec_user" {
  run invoke incident-commander "$INC" Bash '{"command":"kubectl exec -n pnats pod/x --as root -- sh"}'
  [ "$(cap '.action.id')" = "k8s::exec" ]
  [ "$(res exec_user)" = "root" ]
}

@test "MCP k8s delete tool -> k8s::delete" {
  run invoke controlplane-collector "$INC" mcp__kubernetes__pods_delete '{}'
  [ "$(cap '.action.id')" = "k8s::delete" ]
}

@test "MCP prometheus tool -> prometheus::query" {
  run invoke observability-collector "$INC" mcp__prometheus__range_query '{}'
  [ "$(cap '.action.id')" = "prometheus::query" ]
}

@test "unknown MCP tool -> mcp::unknown (deny sink)" {
  run invoke incident-commander "$INC" mcp__mystery__frobnicate '{}'
  [ "$(cap '.action.id')" = "mcp::unknown" ]
}

# ---------------------------------------------------------------- context derivation
@test "verdict_status derived from the latest round verdict.md" {
  run invoke recovery-executor "$INC" Read '{"file_path":"/x"}'
  [ "$(cap '.context.verdict_status')" = "ROOT_CAUSE_CONFIRMED" ]
}

@test "human_approval set from OPSBENCH_HUMAN_APPROVAL" {
  export OPSBENCH_HUMAN_APPROVAL=1
  run invoke quarantine-coordinator "$INC" Read '{"file_path":"/x"}'
  [ "$(cap '.context.human_approval')" = "true" ]
}

@test "recovery_step_id set from OPSBENCH_RECOVERY_STEP_ID" {
  export OPSBENCH_RECOVERY_STEP_ID=S3
  run invoke recovery-executor "$INC" Read '{"file_path":"/x"}'
  [ "$(cap '.context.recovery_step_id')" = "S3" ]
}

# ---------------------------------------------------------------- decision mapping
@test "cedar ALLOW -> hook exit 0" {
  export CEDAR_STUB_DECISION=ALLOW
  run invoke incident-commander "$INC" Read '{"file_path":"/x"}'
  [ "$status" -eq 0 ]
}

@test "cedar DENY -> hook exit 2" {
  export CEDAR_STUB_DECISION=DENY
  run invoke incident-commander "$INC" Read '{"file_path":"/x"}'
  [ "$status" -eq 2 ]
}

# ---------------------------------------------------------------- fail-closed
@test "missing agent identity fails closed (exit 2)" {
  run invoke "" "$TMP" Read '{"file_path":"/x"}'
  [ "$status" -eq 2 ]
}

@test "missing cedar CLI fails closed by default (exit 2)" {
  export OPSBENCH_CEDAR_BIN="/no/such/cedar"
  run invoke incident-commander "$INC" Read '{"file_path":"/x"}'
  [ "$status" -eq 2 ]
}

@test "missing cedar CLI with OPSBENCH_DEV_FAIL_OPEN=1 allows (exit 0)" {
  export OPSBENCH_CEDAR_BIN="/no/such/cedar"
  export OPSBENCH_DEV_FAIL_OPEN=1
  run invoke incident-commander "$INC" Read '{"file_path":"/x"}'
  [ "$status" -eq 0 ]
}

@test "empty stdin fails closed (exit 2)" {
  run bash -c "OPSBENCH_AGENT_NAME=incident-commander OPSBENCH_CEDAR_BIN='$STUB' OPSBENCH_POLICIES_DIR='$POL' bash '$HOOK' < /dev/null"
  [ "$status" -eq 2 ]
}

@test "cedar engine error (rc!=0/2, no decision) fails closed" {
  # a stub that prints an error and exits 1, like a bad-flags invocation
  err="$BATS_TEST_TMPDIR/err-cedar.sh"
  printf '#!/usr/bin/env bash\necho "boom" >&2\nexit 1\n' > "$err"; chmod +x "$err"
  export OPSBENCH_CEDAR_BIN="$err"
  run invoke incident-commander "$INC" Read '{"file_path":"/x"}'
  [ "$status" -eq 2 ]
}
