// Offline verification (spec S1: "offline verification CLI pass").
//
// Validates two independent properties of a sealed ledger segment:
//   1. CHAIN CONTINUITY: every record's prev_hash equals the prior record's hash,
//      seq is monotonic from the genesis (prev_hash = zero digest), and each
//      record's hash recomputes from its canonical body — i.e. tamper-evident.
//   2. CHECKPOINT ROOT: the Merkle root recomputed from the records matches the
//      published checkpoint root, and a sample inclusion proof re-derives it.
//
// No standing infrastructure required (IDN-001 independent verifiability): given
// only the records JSON + checkpoint JSON, this function returns a verdict.

import type { AuditRecord } from "../../../packages/schemas/src/index.ts";
import { ZERO_DIGEST } from "./canonical.ts";
import {
  computeRecordHash,
  merkleRoot,
  leafHash,
  inclusionProof,
  rootFromProof,
  type MerkleCheckpoint,
} from "./ledger.ts";

export interface VerifyResult {
  ok: boolean;
  chainOk: boolean;
  checkpointOk: boolean;
  recordsChecked: number;
  failures: string[];
}

export function verifyLedger(
  records: AuditRecord[],
  checkpoint?: MerkleCheckpoint,
): VerifyResult {
  const failures: string[] = [];

  // --- 1. chain continuity ---
  let expectedPrev = ZERO_DIGEST;
  let chainOk = true;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.seq !== i) {
      failures.push(`record[${i}] seq mismatch: got ${r.seq}`);
      chainOk = false;
    }
    if (r.prev_hash !== expectedPrev) {
      failures.push(`record[${i}] prev_hash break: expected ${expectedPrev}, got ${r.prev_hash}`);
      chainOk = false;
    }
    const { hash, ...withoutHash } = r;
    const recomputed = computeRecordHash(withoutHash, r.prev_hash);
    if (recomputed !== hash) {
      failures.push(`record[${i}] hash tampered: stored ${hash}, recomputed ${recomputed}`);
      chainOk = false;
    }
    expectedPrev = r.hash;
  }

  // --- 2. checkpoint root ---
  let checkpointOk = true;
  if (checkpoint) {
    const slice = records.filter(
      (r) => r.seq >= checkpoint.from_seq && r.seq <= checkpoint.to_seq,
    );
    if (slice.length !== checkpoint.count) {
      failures.push(`checkpoint count mismatch: expected ${checkpoint.count}, got ${slice.length}`);
      checkpointOk = false;
    }
    const leaves = slice.map((r) => leafHash(r.hash));
    if (leaves.length > 0) {
      const { root } = merkleRoot(leaves);
      const prefixed = `sha256:${root}`;
      if (prefixed !== checkpoint.root) {
        failures.push(`checkpoint root mismatch: expected ${checkpoint.root}, got ${prefixed}`);
        checkpointOk = false;
      }
      // sample inclusion proof for a middle leaf
      const sampleIdx = Math.floor(leaves.length / 2);
      const { siblings } = inclusionProof(leaves, sampleIdx);
      const derived = `sha256:${rootFromProof(leaves[sampleIdx], siblings)}`;
      if (derived !== checkpoint.root) {
        failures.push(`inclusion proof for leaf ${sampleIdx} failed to re-derive root`);
        checkpointOk = false;
      }
    }
  }

  return {
    ok: chainOk && checkpointOk,
    chainOk,
    checkpointOk,
    recordsChecked: records.length,
    failures,
  };
}
