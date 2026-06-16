// Append-only per-tenant audit ledger with a sha256 hash chain and periodic
// Merkle checkpoint roots (spec Part 0 §3 "Audit ledger" + §5.1 step 8:
// "ledger write precedes effect acknowledgment").
//
// AuditRecord shape is the schemas package source of truth (audit-record.json).
// hash = sha256( canonical(record without `hash`) || prev_hash ).  The record's
// own `prev_hash` field already carries the chain link, so canonicalising the
// record-minus-hash and feeding prev_hash again is belt-and-suspenders explicit.

import type { AuditRecord } from "../../../packages/schemas/src/index.ts";
import { canonicalize, sha256Hex, sha256HexBytes, ZERO_DIGEST } from "./canonical.ts";
import { ledgerRef } from "./ids.ts";

export type DraftAuditRecord = Omit<AuditRecord, "seq" | "id" | "prev_hash" | "hash">;

/** Compute the chained hash for a record body given the previous hash. */
export function computeRecordHash(
  recordWithoutHash: Omit<AuditRecord, "hash">,
  prevHash: string,
): string {
  const body = canonicalize(recordWithoutHash);
  // strip the algorithm prefix off prev_hash before concatenation, then re-prefix.
  const prevRaw = prevHash.replace(/^sha256:/, "");
  return `sha256:${sha256Hex(body + prevRaw)}`;
}

export interface MerkleCheckpoint {
  tenant_id: string;
  from_seq: number;
  to_seq: number;
  count: number;
  root: string; // sha256:<hex>
  /** Audit-proof sizing: tree depth and the proof length for any single leaf. */
  tree_depth: number;
  proof_len: number; // sibling hashes needed to prove one leaf (== tree_depth)
  proof_bytes: number; // wire size of one inclusion proof in bytes
  created_at: string;
}

export class AuditLedger {
  readonly tenantId: string;
  private readonly records: AuditRecord[] = [];
  private seq = 0;
  private lastHash = ZERO_DIGEST;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /** Append one record to the chain; returns the sealed AuditRecord. */
  append(draft: DraftAuditRecord): AuditRecord {
    const withoutHash: Omit<AuditRecord, "hash"> = {
      ...draft,
      seq: this.seq,
      id: ledgerRef(),
      prev_hash: this.lastHash,
    };
    const hash = computeRecordHash(withoutHash, this.lastHash);
    const record: AuditRecord = { ...withoutHash, hash };
    this.records.push(record);
    this.seq += 1;
    this.lastHash = hash;
    return record;
  }

  all(): readonly AuditRecord[] {
    return this.records;
  }

  /** Build a Merkle checkpoint over leaves [fromSeq, toSeq]. */
  checkpoint(fromSeq = 0, toSeq = this.seq - 1): MerkleCheckpoint {
    const slice = this.records.filter((r) => r.seq >= fromSeq && r.seq <= toSeq);
    if (slice.length === 0) throw new Error("empty checkpoint range");
    const leaves = slice.map((r) => leafHash(r.hash));
    const { root, depth } = merkleRoot(leaves);
    return {
      tenant_id: this.tenantId,
      from_seq: fromSeq,
      to_seq: toSeq,
      count: slice.length,
      root: `sha256:${root}`,
      tree_depth: depth,
      proof_len: depth,
      // one inclusion proof = `depth` sibling digests, each 32 raw bytes / 64 hex.
      proof_bytes: depth * 32,
      created_at: new Date().toISOString(),
    };
  }
}

/** Domain-separated leaf hash (0x00 prefix) to resist second-preimage attacks. */
function leafHash(recordHashPrefixed: string): string {
  const raw = recordHashPrefixed.replace(/^sha256:/, "");
  return sha256HexBytes(Buffer.concat([Buffer.from([0x00]), Buffer.from(raw, "hex")]));
}

/** Internal node hash (0x01 prefix). */
function nodeHash(left: string, right: string): string {
  return sha256HexBytes(
    Buffer.concat([Buffer.from([0x01]), Buffer.from(left, "hex"), Buffer.from(right, "hex")]),
  );
}

/** Compute a Merkle root by duplicating the last node on odd levels (Bitcoin-style). */
export function merkleRoot(leaves: string[]): { root: string; depth: number } {
  if (leaves.length === 0) throw new Error("no leaves");
  let level = leaves;
  let depth = 0;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i]; // duplicate odd tail
      next.push(nodeHash(left, right));
    }
    level = next;
    depth += 1;
  }
  return { root: level[0], depth };
}

/** Produce an inclusion proof (sibling path) for the leaf at `index`. */
export function inclusionProof(
  leaves: string[],
  index: number,
): { siblings: { hash: string; position: "left" | "right" }[] } {
  const siblings: { hash: string; position: "left" | "right" }[] = [];
  let level = leaves;
  let idx = index;
  while (level.length > 1) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling = siblingIdx < level.length ? level[siblingIdx] : level[idx];
    siblings.push({ hash: sibling, position: isRight ? "left" : "right" });
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i];
      const r = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(nodeHash(l, r));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return { siblings };
}

/** Re-derive a root from a leaf + proof (used by the verifier and tests). */
export function rootFromProof(
  leaf: string,
  proof: { hash: string; position: "left" | "right" }[],
): string {
  let acc = leaf;
  for (const step of proof) {
    acc = step.position === "left" ? nodeHash(step.hash, acc) : nodeHash(acc, step.hash);
  }
  return acc;
}

export { leafHash };
