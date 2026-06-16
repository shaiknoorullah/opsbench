// Every artifact the gatekeeper emits MUST validate against the real
// @opsbench/schemas validators (the source of truth, spec Part 1). This guards
// against the spike drifting from the normative contracts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { validator } from "../../../packages/schemas/src/index.ts";
import { generateReferenceSet } from "../src/reference-set.ts";
import { CedarEngine } from "../src/cedar-engine.ts";
import { AuditLedger } from "../src/ledger.ts";
import { Gatekeeper, MockExecutor, type MutationProposal } from "../src/gatekeeper.ts";

function run() {
  const ref = generateReferenceSet({ teams: 4, toolsPerTeam: 10 });
  const engine = new CedarEngine(ref.policies, ref.entities);
  const gk = new Gatekeeper(engine, new AuditLedger("t_acme"), new MockExecutor());
  const p: MutationProposal = {
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
  return gk.run(p, { approverDecision: "approved" });
}

const result = run();

test("PolicyDecisionRecord conforms to policy-decision-record.json", () => {
  const v = validator("policyDecisionRecord");
  const ok = v(result.decisionRecord);
  assert.equal(ok, true, JSON.stringify(v.errors));
});

test("ApprovalObject conforms to approval-object.json", () => {
  const v = validator("approvalObject");
  const ok = v(result.approval);
  assert.equal(ok, true, JSON.stringify(v.errors));
});

test("every AuditRecord conforms to audit-record.json", () => {
  const v = validator("auditRecord");
  for (const rec of result.ledger) {
    const ok = v(rec);
    assert.equal(ok, true, `seq ${rec.seq}: ${JSON.stringify(v.errors)}`);
  }
});

test("AuditRecord hash/prev_hash use the sha256:<hex> form required by common.json", () => {
  for (const rec of result.ledger) {
    assert.match(rec.hash, /^sha256:[a-f0-9]{64}$/);
    assert.match(rec.prev_hash, /^sha256:[a-f0-9]{64}$/);
  }
});

test("ledger contains a denial record only on the deny path (denials are first-class)", () => {
  // Happy path has no denials in the chain.
  const denials = result.ledger.filter((r) => r.decision.effect === "deny");
  assert.equal(denials.length, 0);
});
