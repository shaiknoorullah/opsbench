// Crockford base32 ULID-shaped id generator.
//
// The AutonomyCertificate / AuditRecord schemas require prefixed ids whose body
// is exactly 26 chars from the Crockford alphabet [0-9A-HJKMNP-TV-Z] (no I,L,O,U).
// For a reproducible spike we expose a *seedable* generator so the same replay
// run produces the same ids on every rerun — this is what makes criterion 2
// (score stability) and the evidence block deterministic.

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 symbols, no I L O U

/** A small deterministic PRNG (mulberry32) so id streams are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a 26-char Crockford base32 body from a PRNG. */
function body(rng: () => number): string {
  let s = "";
  for (let i = 0; i < 26; i++) {
    s += CROCKFORD[Math.floor(rng() * 32)];
  }
  return s;
}

/**
 * A factory bound to a seed. All ids drawn from one factory are stable for a
 * given seed and draw order, which is exactly what reproducible replay needs.
 */
export class IdFactory {
  private rng: () => number;
  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }
  make(prefix: string): string {
    return `${prefix}_${body(this.rng)}`;
  }
  evalRun(): string {
    return this.make("evr");
  }
  cert(): string {
    return this.make("cert");
  }
  ledger(): string {
    return this.make("led");
  }
}
