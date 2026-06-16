// Crockford-base32 ULID generation matching the schemas' id patterns
// (common.json: ^[0-9A-HJKMNP-TV-Z]{26}$ for the random part, with domain prefixes).
//
// We implement a minimal monotonic ULID locally to avoid an external dep and to
// keep the spike standalone. 48-bit timestamp + 80-bit randomness, Crockford base32.

import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // excludes I L O U

function encodeCrockford(bytes: Uint8Array, length: number): string {
  // Encode the 128-bit value (16 bytes) into 26 Crockford base32 chars.
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < length; i++) {
    out = CROCKFORD[Number(bits & 31n)] + out;
    bits >>= 5n;
  }
  return out;
}

let lastTime = 0;
let lastRand = randomBytes(10);

/** Generate a 26-char Crockford ULID (monotonic within a millisecond). */
export function ulid(now = Date.now()): string {
  const time = new Uint8Array(6);
  let t = now;
  for (let i = 5; i >= 0; i--) {
    time[i] = t & 0xff;
    t = Math.floor(t / 256);
  }
  let rand: Buffer;
  if (now === lastTime) {
    // monotonic increment of the random component
    rand = Buffer.from(lastRand);
    for (let i = 9; i >= 0; i--) {
      if (rand[i] === 0xff) {
        rand[i] = 0;
      } else {
        rand[i] += 1;
        break;
      }
    }
  } else {
    rand = randomBytes(10);
    lastTime = now;
  }
  lastRand = rand;
  const all = new Uint8Array(16);
  all.set(time, 0);
  all.set(rand, 6);
  return encodeCrockford(all, 26);
}

export const prefixed = (p: string): string => `${p}_${ulid()}`;
export const ledgerRef = (): string => prefixed("led");
export const approvalId = (): string => prefixed("apr");
export const actionRef = (): string => prefixed("act");
export const idempotencyKey = (): string => prefixed("idk");
export const pdrId = (): string => prefixed("pdr");
export const taskId = (): string => prefixed("tsk");
