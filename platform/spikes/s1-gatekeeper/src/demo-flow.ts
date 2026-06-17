// `npm run flow` — runs the §5.1 governed-mutation vertical slice end to end and
// prints each stage, then validates every emitted artifact against the real
// schemas and runs the offline verifier over the produced ledger.

import { generateReferenceSet } from "./reference-set.ts";
import { CedarEngine } from "./cedar-engine.ts";
import { AuditLedger } from "./ledger.ts";
import { Gatekeeper, MockExecutor, type MutationProposal } from "./gatekeeper.ts";
import { verifyLedger } from "./verify.ts";
import { hashObject } from "./canonical.ts";
import { validator } from "../../../packages/schemas/src/index.ts";

const TENANT = "t_acme";

function line(s: string) {
  console.log(s);
}

function buildProposal(): MutationProposal {
  // privileged agent t0-agent-0 scaling a non-danger PROD tool -> permitted by
  // pol_priv_0, a tier-2 single-approval mutation.
  return {
    tenantId: TENANT,
    agentSpiffe: "spiffe://t_acme/agent/inv-7",
    humanAuthorizer: "usr_alice",
    toolName: "kubernetes:scale",
    cedarRequest: {
      principal: { type: "Agent", id: "t0-agent-0" },
      action: { type: "Action", id: "invoke" },
      resource: { type: "Tool", id: "t0-tool-1" }, // env staging, non-danger
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

function main() {
  line("=== S1 Governed-Mutation Flow (spec Part 0 §5.1) ===\n");

  const ref = generateReferenceSet();
  line(`reference set: ${ref.counts.policies} policies, ${ref.counts.entities} entities`);
  const engine = new CedarEngine(ref.policies, ref.entities);
  const ledger = new AuditLedger(TENANT);
  const executor = new MockExecutor();
  const gk = new Gatekeeper(engine, ledger, executor);

  const proposal = buildProposal();

  // --- Phase (a): tool-list filtering for this agent over a tool subset ---
  const candidate = ref.tools.slice(0, 200).map((id) => ({ type: "Tool", id }));
  const filtered = gk["engine"].filterTools(
    proposal.cedarRequest.principal,
    { type: "Action", id: "invoke" },
    proposal.cedarRequest.context,
    candidate,
  );
  line(
    `\n[1] tool-list filter (strategy=${filtered.strategy}): ` +
      `${filtered.visible.length}/${candidate.length} tools visible to t0-agent-0`,
  );

  // --- Full happy-path flow ---
  line("\n[2] HAPPY PATH — approved, payload unchanged");
  const ok = gk.run(proposal, { approverDecision: "approved", approverSurface: "slack" });
  line(`    policy effect: ${ok.decisionRecord.effect} (${ok.decisionRecord.latency_ms} ms)`);
  line(`    approval state: ${ok.finalState}; executed=${ok.executed}; rollback=${ok.rollbackHandle}`);
  line(`    payload_hash pinned: ${ok.approval?.payload_hash.slice(0, 24)}...`);

  // --- Tamper path: payload mutated after approval ---
  line("\n[3] TAMPER PATH — approved, but executed payload mutated (replicas 6 -> 600)");
  const ledger2 = new AuditLedger(TENANT);
  const gk2 = new Gatekeeper(engine, ledger2, new MockExecutor());
  const tampered = gk2.run(proposal, {
    approverDecision: "approved",
    executionPayloadOverride: { ...proposal.payload, replicas: 600 },
  });
  line(`    approval state: ${tampered.finalState}; executed=${tampered.executed}`);
  line(`    blocked reason: ${tampered.blockedReason}`);

  // --- Policy-deny path ---
  line("\n[4] POLICY-DENY PATH — non-privileged agent on a prod+danger tool");
  const denyProposal = buildProposal();
  denyProposal.cedarRequest.principal = { type: "Agent", id: "t1-agent-1" };
  denyProposal.cedarRequest.resource = { type: "Tool", id: "t1-tool-0" }; // prod+danger
  const ledger3 = new AuditLedger(TENANT);
  const gk3 = new Gatekeeper(engine, ledger3, new MockExecutor());
  const denied = gk3.run(denyProposal, { approverDecision: "approved" });
  line(`    policy effect: ${denied.decisionRecord.effect}; final: ${denied.finalState}`);

  // --- Schema validation of every artifact from the happy path ---
  line("\n[5] SCHEMA VALIDATION (real @opsbench/schemas validators)");
  const vPdr = validator("policyDecisionRecord");
  const vApr = validator("approvalObject");
  const vAud = validator("auditRecord");
  const pdrOk = vPdr(ok.decisionRecord);
  line(`    PolicyDecisionRecord: ${pdrOk ? "VALID" : "INVALID " + JSON.stringify(vPdr.errors)}`);
  const aprOk = vApr(ok.approval);
  line(`    ApprovalObject:       ${aprOk ? "VALID" : "INVALID " + JSON.stringify(vApr.errors)}`);
  let allAud = true;
  for (const rec of ok.ledger) {
    if (!vAud(rec)) {
      allAud = false;
      line(`    AuditRecord seq=${rec.seq}: INVALID ${JSON.stringify(vAud.errors)}`);
    }
  }
  line(`    AuditRecords (${ok.ledger.length}): ${allAud ? "ALL VALID" : "HAS INVALID"}`);

  // --- Offline verification + checkpoint ---
  line("\n[6] LEDGER VERIFICATION + MERKLE CHECKPOINT");
  const checkpoint = ledger.checkpoint();
  const verdict = verifyLedger([...ledger.all()], checkpoint);
  line(`    chain continuity: ${verdict.chainOk ? "OK" : "FAIL"}`);
  line(`    checkpoint root:  ${verdict.checkpointOk ? "OK" : "FAIL"} (${checkpoint.root.slice(0, 24)}...)`);
  line(`    records checked:  ${verdict.recordsChecked}; tree depth=${checkpoint.tree_depth}; proof=${checkpoint.proof_bytes} bytes`);
  if (verdict.failures.length) line(`    failures: ${verdict.failures.join("; ")}`);

  // --- Tamper-detection demonstration on the verifier ---
  line("\n[7] TAMPER DETECTION — mutate a sealed record, re-verify");
  const recs = [...ledger.all()].map((r) => ({ ...r }));
  if (recs.length > 1) {
    (recs[1].operation as { name: string }).name = "kubernetes:DELETE_EVERYTHING";
    const after = verifyLedger(recs, checkpoint);
    line(`    verifier verdict after tamper: ${after.ok ? "OK (BAD!)" : "REJECTED (correct)"}`);
    line(`    first failure: ${after.failures[0] ?? "none"}`);
  }

  const allPass =
    ok.executed &&
    !tampered.executed &&
    tampered.blockedReason === "payload_hash_mismatch" &&
    denied.finalState === "denied_by_policy" &&
    pdrOk &&
    aprOk &&
    allAud &&
    verdict.ok;
  line(`\n=== FLOW ${allPass ? "PASS" : "FAIL"} ===`);
  if (!allPass) process.exit(1);
}

main();
