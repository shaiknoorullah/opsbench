// Deterministic canonical JSON + sha256 helpers.
//
// The schemas (audit-record.json, approval-object.json) require sha256 digests
// in the form `sha256:<64 lowercase hex>`. Hashing MUST be deterministic across
// processes and machines, so JSON keys are sorted recursively (RFC 8785-style
// canonicalization, minus number-form normalisation which we do not need because
// all hashed fields are strings/ints already).

import { createHash } from "node:crypto";

/** Recursively sort object keys to produce a deterministic JSON string. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Raw lowercase-hex sha256 of a string (no prefix). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** sha256 of raw bytes, lowercase hex (no prefix). Used for Merkle node concat. */
export function sha256HexBytes(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Schema-shaped digest: `sha256:<64 hex>`. */
export function sha256Prefixed(input: string): string {
  return `sha256:${sha256Hex(input)}`;
}

/** Canonical-JSON hash of any object, schema-prefixed. */
export function hashObject(value: unknown): string {
  return sha256Prefixed(canonicalize(value));
}

export const ZERO_DIGEST = `sha256:${"0".repeat(64)}`;
