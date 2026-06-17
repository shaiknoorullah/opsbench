// Recall fan-out benchmark (criterion 3): P95 <= 500 ms across 4 scope tiers at
// a 100k-memory corpus, against the in-memory backend.
//
// Methodology:
//   * Seed exactly CORPUS_SIZE memories distributed across the caller's 4
//     permitted tiers (agent/team/dept/org) for one tenant, plus the SAME count
//     of decoy memories in sibling/other-tenant buckets that MUST be ignored
//     (so the index is realistically large and isolation is exercised under load).
//   * Run WARMUP then ITERS recalls through the real MemoryRbacProxy.recall path
//     (compile claims -> RBAC filter -> 4-tier fan-out -> recency x relevance merge).
//   * Report min / p50 / p95 / p99 / max wall-clock per recall, and assert
//     leakage == 0 across all iterations.
//
// Run: npm run bench   (optionally CORPUS_SIZE=200000 npm run bench)

import { InMemoryBackend } from "../src/backend-inmemory.ts";
import { MemoryRbacProxy } from "../src/proxy.ts";
import type { IdentityClaims } from "../src/claims.ts";

const CORPUS_SIZE = Number(process.env.CORPUS_SIZE ?? 100_000);
const ITERS = Number(process.env.ITERS ?? 300);
const WARMUP = Number(process.env.WARMUP ?? 30);
const PER_TIER_LIMIT = Number(process.env.PER_TIER_LIMIT ?? 50);

const caller: IdentityClaims = {
  tenant_id: "t_a",
  org: "acme",
  dept: ["eng"],
  team: ["sre"],
  agent: "inv1",
  principal: "spiffe://t_a/agent/inv1",
};

// The 4 permitted (tenant-folded) buckets the proxy will fan out across.
const PERMITTED = [
  "t/t_a/org/acme/dept/eng/team/sre/agent/inv1",
  "t/t_a/org/acme/dept/eng/team/sre",
  "t/t_a/org/acme/dept/eng",
  "t/t_a/org/acme",
];
// Decoy buckets that MUST never appear in results.
const DECOYS = [
  "t/t_a/org/acme/dept/eng/team/oncall", // sibling team
  "t/t_a/org/acme/dept/eng/team/sre/agent/inv2", // sibling agent
  "t/t_a/org/acme/dept/finance", // sibling dept
  "t/t_b/org/acme/dept/eng/team/sre/agent/inv1", // cross-tenant, identical logical ns
];

const NOUNS = ["latency", "deploy", "rollback", "incident", "checkout", "cache", "queue", "shard", "index", "alert"];
const VERBS = ["spiked", "failed", "recovered", "throttled", "scaled", "drained", "restarted", "paged"];
function synth(i: number): string {
  const n = NOUNS[i % NOUNS.length];
  const v = VERBS[(i >> 3) % VERBS.length];
  return `service ${n} ${v} at step ${i} with token T${i % 997}`;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function main(): Promise<void> {
  const backend = new InMemoryBackend();
  const now = Date.now();

  // Seed permitted corpus: CORPUS_SIZE spread across 4 tiers.
  for (let i = 0; i < CORPUS_SIZE; i++) {
    const ns = PERMITTED[i % PERMITTED.length]!;
    backend.seed({
      tenant_id: "t_a",
      namespace: ns,
      text: synth(i),
      created_at: now - (i % 90) * 24 * 3600 * 1000, // ages 0..89 days
    });
  }
  // Seed an EQUAL volume of decoys so the store is ~2x and isolation is stressed.
  for (let i = 0; i < CORPUS_SIZE; i++) {
    const ns = DECOYS[i % DECOYS.length]!;
    backend.seed({
      tenant_id: ns.startsWith("t/t_b/") ? "t_b" : "t_a",
      namespace: ns,
      text: `DECOY ${synth(i)} SECRET`,
      created_at: now - (i % 90) * 24 * 3600 * 1000,
    });
  }

  const total = await backend.count();
  const proxy = new MemoryRbacProxy({ backend });

  const queries = Array.from({ length: 50 }, (_, k) => synth(k * 137));
  let leaks = 0;
  let partials = 0;

  // Warmup.
  for (let i = 0; i < WARMUP; i++) {
    await proxy.recall(caller, queries[i % queries.length]!, { perTierTimeoutMs: 1000, limit: 25, perTierLimit: PER_TIER_LIMIT });
  }

  const samples: number[] = [];
  for (let i = 0; i < ITERS; i++) {
    const q = queries[i % queries.length]!;
    const t0 = performance.now();
    const r = await proxy.recall(caller, q, { perTierTimeoutMs: 1000, limit: 25, perTierLimit: PER_TIER_LIMIT });
    const dt = performance.now() - t0;
    samples.push(dt);
    if (r.partial) partials++;
    for (const it of r.items) {
      if (it.text.includes("DECOY") || it.text.includes("SECRET")) leaks++;
    }
  }

  samples.sort((a, b) => a - b);
  const p50 = pct(samples, 50);
  const p95 = pct(samples, 95);
  const p99 = pct(samples, 99);
  const PASS = p95 <= 500 && leaks === 0;

  console.log("=== S2 recall fan-out benchmark ===");
  console.log(`node            : ${process.version}`);
  console.log(`backend         : ${backend.name}`);
  console.log(`corpus (permitted): ${CORPUS_SIZE.toLocaleString()} across 4 tiers`);
  console.log(`corpus (total incl decoys): ${total.toLocaleString()}`);
  console.log(`iters           : ${ITERS} (warmup ${WARMUP})`);
  console.log(`per-tier limit  : ${PER_TIER_LIMIT}`);
  console.log("--- latency (ms, wall-clock per recall) ---");
  console.log(`min  : ${samples[0]!.toFixed(2)}`);
  console.log(`p50  : ${p50.toFixed(2)}`);
  console.log(`p95  : ${p95.toFixed(2)}   (budget <= 500)`);
  console.log(`p99  : ${p99.toFixed(2)}`);
  console.log(`max  : ${samples[samples.length - 1]!.toFixed(2)}`);
  console.log("--- isolation under load ---");
  console.log(`leaked items    : ${leaks}   (must be 0)`);
  console.log(`partial recalls : ${partials}`);
  console.log(`\nRESULT: ${PASS ? "PASS" : "FAIL"}  (p95 ${p95.toFixed(2)}ms <= 500ms && leaks ${leaks} == 0)`);
  if (!PASS) process.exit(1);
}

main();
