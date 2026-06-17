// EC4: a payload mutated AFTER approval must be blocked at execution
// (ApprovalObject invariant GOV-004: executed payload_hash MUST equal approved
// payload_hash).

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateReferenceSet } from "../src/reference-set.ts";
import { CedarEngine } from "../src/cedar-engine.ts";
import { AuditLedger } from "../src/ledger.ts";
import { Gatekeeper, MockExecutor, type MutationProposal } from "../src/gatekeeper.ts";
import { hashObject } from "../src/canonical.ts";

function proposal(): MutationProposal {
  return {
    tenantId: "t_acme",
    agentSpiffe: "spiffe://t_acme/agent/inv-7",
    humanAuthorizer: "usr_alice",
    toolName: "kubernetes:scale",
    cedarRequest: {
      principal: { type: "Agent", id: "t0-agent-0" },
      action: { type: "Action", id: "invoke" },
      resource: { type: "Tool", id: "t0-tool-1" },
      context: { freeze: false, tier: 2 },
    },
    resourceSystem: "k8s:prod-eu",
    resourceRef: "deploy/checkout",
    payload: { kind: "scale", deployment: "checkout", namespace: "prod-eu", replicas: 6 },
    irreversible: false,
    tier: 2,
    eligibleReviewers: ["usr_alice", "grp_sre-oncall"],
  };
}

function freshGk() {
  const ref = generateReferenceSet({ teams: 4, toolsPerTeam: 10 });
  const engine = new CedarEngine(ref.policies, ref.entities);
  const executor = new MockExecutor();
  const gk = new Gatekeeper(engine, new AuditLedger("t_acme"), executor);
  return { gk, executor };
}

test("approved + unchanged payload -> executes", () => {
  const { gk, executor } = freshGk();
  const res = gk.run(proposal(), { approverDecision: "approved" });
  assert.equal(res.finalState, "executed");
  assert.equal(res.executed, true);
  assert.equal(executor.applied.length, 1);
  // executed payload hash equals approved hash
  assert.equal(hashObject(executor.applied[0].payload), res.approval!.payload_hash);
});

test("approved but payload mutated after approval -> BLOCKED at execution", () => {
  const { gk, executor } = freshGk();
  const p = proposal();
  const res = gk.run(p, {
    approverDecision: "approved",
    executionPayloadOverride: { ...p.payload, replicas: 600 }, // tampered
  });
  assert.equal(res.blockedReason, "payload_hash_mismatch");
  assert.equal(res.finalState, "invalidated");
  assert.equal(res.executed, false);
  // the mock target was NEVER called — nothing reached the cluster
  assert.equal(executor.applied.length, 0);
});

test("even a trivial field reorder that changes bytes is caught; semantic equality preserved", () => {
  // canonicalization sorts keys, so a pure key REORDER of the same payload must
  // NOT trip the invariant (no false positive), while any VALUE change must.
  const { gk, executor } = freshGk();
  const p = proposal();
  // same values, different key insertion order
  const reordered = { replicas: 6, namespace: "prod-eu", deployment: "checkout", kind: "scale" };
  const res = gk.run(p, { approverDecision: "approved", executionPayloadOverride: reordered });
  assert.equal(res.finalState, "executed", "key reorder must not invalidate (canonical JSON)");
  assert.equal(executor.applied.length, 1);
});

test("rejected approval never executes", () => {
  const { gk, executor } = freshGk();
  const res = gk.run(proposal(), { approverDecision: "rejected" });
  assert.equal(res.finalState, "rejected");
  assert.equal(res.executed, false);
  assert.equal(executor.applied.length, 0);
});

test("approver attests to the exact approved hash (decision log integrity)", () => {
  const { gk } = freshGk();
  const res = gk.run(proposal(), { approverDecision: "approved" });
  const d = res.approval!.decisions[0];
  assert.equal(d.payload_hash_seen, res.approval!.payload_hash);
});
