// PIN handling. CORE INVARIANT (spec §7): PIN values NEVER persist. We store only
// a verification *result* and a salted hash of the digits pressed (digits_hash),
// never the PIN itself and never the cleartext digits in a recoverable form.
//
// The digits_hash binds "which digits were pressed" to the evidence record for
// forensic attribution without being a reversible store of the secret. Per-incident
// salt prevents the 4-6 digit space from being trivially rainbow-tabled.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** sha256:<hex> over salt||digits. Matches common.json#/$defs/sha256. */
export function digitsHash(digits: string, salt: string): string {
  const h = createHash("sha256").update(`${salt}:${digits}`).digest("hex");
  return `sha256:${h}`;
}

/** Per-incident random salt (hex). Stored alongside the ladder, not secret. */
export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Constant-time comparison of an entered PIN against the expected PIN.
 * Neither value is retained after this call returns. Length-mismatch is treated
 * as a non-match without leaking timing on the common path.
 */
export function verifyPin(entered: string, expected: string): boolean {
  const a = Buffer.from(entered, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
