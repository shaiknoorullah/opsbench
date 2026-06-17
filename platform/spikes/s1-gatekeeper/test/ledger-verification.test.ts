// EC2 (mechanism): chained audit ledger + Merkle checkpoint + offline
// verification. Proves chain continuity, tamper-evidence, and checkpoint-root
// re-derivation including a single-leaf inclusion proof.

import { test } from "node:test";
import assert from "node:assert/strict";
import { AuditLedger, inclusionProof, rootFromProof, leafHash, merkleRoot } from "../src/ledger.ts";
import { verifyLedger } from "../src/verify.ts";
import { ZERO_DIGEST } from "../src/canonical.ts";
import type { AuditRecord } from "../../../packages/schemas/src/index.ts";

function fill(ledger: AuditLedger, n: number) {
  for (let i = 0; i < n; i++) {
    ledger.append({
      tenant_id: ledger.tenantId,
      ts: new Date().toISOString(),
      agent: { id: "spiffe://t_x/agent/inv-7" },
      delegation_chain: ["usr_alice", "spiffe://t_x/agent/inv-7"],
      resources: [{ system: "k8s:prod-eu", ref: `deploy/svc-${i}`, data_class: "config" }],
      operation: { kind: "tool_call", name: "kubernetes:scale" },
      decision: { effect: "permit" },
      outcome: { status: "ok" },
      context: { time_source: "ntp:pool.ntp.org" },
    });
  }
}

test("genesis record links to the zero digest; seq is monotonic", () => {
  const l = new AuditLedger("t_x");
  fill(l, 5);
  const recs = [...l.all()];
  assert.equal(recs[0].prev_hash, ZERO_DIGEST);
  recs.forEach((r, i) => assert.equal(r.seq, i));
  for (let i = 1; i < recs.length; i++) {
    assert.equal(recs[i].prev_hash, recs[i - 1].hash);
  }
});

test("clean ledger + checkpoint verifies OK", () => {
  const l = new AuditLedger("t_x");
  fill(l, 37);
  const cp = l.checkpoint();
  const res = verifyLedger([...l.all()], cp);
  assert.equal(res.ok, true, res.failures.join("; "));
  assert.equal(res.chainOk, true);
  assert.equal(res.checkpointOk, true);
  assert.equal(res.recordsChecked, 37);
});

test("mutating a record body breaks chain verification", () => {
  const l = new AuditLedger("t_x");
  fill(l, 10);
  const cp = l.checkpoint();
  const recs: AuditRecord[] = [...l.all()].map((r) => ({ ...r, operation: { ...r.operation } }));
  recs[4].operation.name = "kubernetes:DELETE_NAMESPACE"; // tamper
  const res = verifyLedger(recs, cp);
  assert.equal(res.ok, false);
  assert.equal(res.chainOk, false);
  assert.ok(res.failures.some((f) => f.includes("hash tampered")));
});

test("reordering / dropping a record breaks prev_hash continuity", () => {
  const l = new AuditLedger("t_x");
  fill(l, 8);
  const recs = [...l.all()];
  const dropped = [...recs.slice(0, 3), ...recs.slice(4)]; // drop index 3
  const res = verifyLedger(dropped);
  assert.equal(res.chainOk, false);
});

test("checkpoint root re-derives from an inclusion proof for every leaf", () => {
  const l = new AuditLedger("t_x");
  fill(l, 23); // odd count exercises the duplicate-tail path
  const recs = [...l.all()];
  const leaves = recs.map((r) => leafHash(r.hash));
  const { root } = merkleRoot(leaves);
  for (let i = 0; i < leaves.length; i++) {
    const { siblings } = inclusionProof(leaves, i);
    assert.equal(rootFromProof(leaves[i], siblings), root, `leaf ${i} proof failed`);
  }
});

test("tampering after a checkpoint also fails the checkpoint root", () => {
  const l = new AuditLedger("t_x");
  fill(l, 16);
  const cp = l.checkpoint();
  const recs: AuditRecord[] = [...l.all()].map((r) => ({ ...r }));
  // forge a record's stored hash directly (skip chain check by also fixing prev)
  recs[7] = { ...recs[7], hash: "sha256:" + "a".repeat(64) };
  if (recs[8]) recs[8] = { ...recs[8], prev_hash: recs[7].hash };
  const res = verifyLedger(recs, cp);
  assert.equal(res.checkpointOk, false);
});

test("a 1024-record checkpoint has depth 10 and a 320-byte inclusion proof", () => {
  const l = new AuditLedger("t_x");
  fill(l, 1024);
  const cp = l.checkpoint(0, 1023);
  assert.equal(cp.tree_depth, 10);
  assert.equal(cp.proof_bytes, 320); // 10 sibling digests * 32 bytes
});
