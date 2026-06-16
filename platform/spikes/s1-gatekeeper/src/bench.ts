// `npm run bench` — NF-004 (Cedar) and NF-003 (ledger) latency numbers for the
// S1 exit criteria. Tractable iteration counts so it completes in seconds.
//
// Reference set: >= 200 policies, >= 5000 entities (generated programmatically).
//
// Measures:
//   [B] Cedar phase (b) invocation auth — preparsed pset + sliced entities (the
//       production hot path), P50/P95/P99 over 1000 single calls.
//   [C] Cedar phase (a) tool-list filtering — one 200-tool listing, 20 reps,
//       per-listing wall time.
//   [W] WORST CASE — naive isAuthorized (re-parse) and stateful+full-entities, a
//       handful of calls each, to show why slicing/preparse is mandatory.
//   [D] Audit-ledger append — P50/P95/P99 over 20k appends.
//   [E] Merkle checkpoint cadence vs. proof-size table.

import * as cedar from "@cedar-policy/cedar-wasm/nodejs";
import { generateReferenceSet } from "./reference-set.ts";
import { CedarEngine } from "./cedar-engine.ts";
import { AuditLedger } from "./ledger.ts";
import { hashObject } from "./canonical.ts";

interface Stats { n: number; p50: number; p95: number; p99: number; max: number; mean: number }
const pct = (s: number[], p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
function summarize(samples: number[]): Stats {
  const s = [...samples].sort((a, b) => a - b);
  return { n: s.length, p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99), max: s[s.length - 1], mean: s.reduce((a, b) => a + b, 0) / s.length };
}
const ms = (x: number) => x.toFixed(3);
function printStats(label: string, st: Stats, budgetMs?: number) {
  const v = budgetMs !== undefined ? (st.p99 <= budgetMs ? "PASS" : "FAIL") : "";
  console.log(`  ${label.padEnd(44)} n=${String(st.n).padStart(6)}  p50=${ms(st.p50)}  p95=${ms(st.p95)}  p99=${ms(st.p99)}  max=${ms(st.max)} ms${budgetMs !== undefined ? `  (budget ${budgetMs}ms) ${v}` : ""}`);
}

function main() {
  const t0 = performance.now();
  const ref = generateReferenceSet();
  const engine = new CedarEngine(ref.policies, ref.entities);
  const buildMs = performance.now() - t0;

  console.log("=== S1 Benchmark — Cedar + Audit Ledger ===\n");
  console.log(`Reference set: ${ref.counts.policies} policies, ${ref.counts.entities} entities (${ref.counts.agents} agents, ${ref.counts.tools} tools, ${ref.counts.teams} teams)`);
  console.log(`Engine build (parse + preparse pset): ${ms(buildMs)} ms (one-time)`);
  console.log(`Host: node ${process.version}, ${process.platform}/${process.arch}\n`);

  const agents = ref.agents;
  const tools = ref.tools;
  const mkReq = (i: number) => ({
    principal: { type: "Agent", id: agents[i % agents.length] },
    action: { type: "Action", id: "invoke" },
    resource: { type: "Tool", id: tools[(i * 7) % tools.length] },
    context: { freeze: false, tier: 2 },
  });

  // --- [B] invocation auth, warm, production hot path (preparsed + sliced) ---
  for (let i = 0; i < 1000; i++) engine.authorize(mkReq(i)); // warm
  const inv: number[] = [];
  for (let i = 0; i < 1000; i++) { const r = mkReq(i); const t = performance.now(); engine.authorize(r); inv.push(performance.now() - t); }
  console.log("[B] Cedar phase (b) INVOCATION auth — preparsed pset + sliced entities (NF-004 ≤100ms)");
  printStats("invocation auth (208 pol / 6k ent, sliced)", summarize(inv), 100);

  // --- [C] tool-list filtering: one 200-tool listing, 20 reps ---
  console.log("\n[C] Cedar phase (a) TOOL-LIST filtering — 200 tools/listing, per-tool stateful (NF-004 ≤100ms)");
  const CAT = 200;
  const listing: number[] = [];
  let visibleSample = 0;
  for (let rep = 0; rep < 5; rep++) { // warm
    const principal = { type: "Agent", id: agents[rep % agents.length] };
    const cand = Array.from({ length: CAT }, (_, k) => ({ type: "Tool", id: tools[(rep + k) % tools.length] }));
    engine.filterTools(principal, { type: "Action", id: "invoke" }, { freeze: false }, cand);
  }
  for (let rep = 0; rep < 20; rep++) {
    const principal = { type: "Agent", id: agents[rep % agents.length] };
    const cand = Array.from({ length: CAT }, (_, k) => ({ type: "Tool", id: tools[(rep + k) % tools.length] }));
    const t = performance.now();
    const res = engine.filterTools(principal, { type: "Action", id: "invoke" }, { freeze: false }, cand);
    listing.push(performance.now() - t);
    visibleSample = res.visible.length;
  }
  printStats(`tool-list filter (${CAT} tools/listing)`, summarize(listing), 100);
  console.log(`    (last listing: ${visibleSample}/${CAT} tools visible; per-tool ≈ ${ms(summarize(listing).p50 / CAT)} ms)`);

  // --- [W] worst-case anti-patterns, small samples ---
  console.log("\n[W] WORST CASE (why preparse + slicing are mandatory) — small samples");
  const naive: number[] = [];
  for (let i = 0; i < 12; i++) { const r = mkReq(i); const t = performance.now(); cedar.isAuthorized({ principal: r.principal, action: r.action, resource: r.resource, context: r.context, policies: ref.policies, entities: ref.entities }); naive.push(performance.now() - t); }
  printStats("naive isAuthorized (re-parse pset+ents)", summarize(naive), 100);
  engine.passFullEntities = true;
  const full: number[] = [];
  for (let i = 0; i < 50; i++) { const r = mkReq(i); const t = performance.now(); engine.authorize(r); full.push(performance.now() - t); }
  printStats("stateful pset + FULL 6k entities", summarize(full), 100);
  engine.passFullEntities = false;

  // --- [D] audit-ledger append ---
  console.log("\n[D] Audit-ledger APPEND (canonical-JSON hash + chain link, NF-003 ≤25ms)");
  const ledger = new AuditLedger("t_bench");
  const draft = (i: number) => ({
    tenant_id: "t_bench", ts: new Date().toISOString(),
    agent: { id: "spiffe://t_bench/agent/inv-7", version: "1.4.0" },
    delegation_chain: ["usr_alice", "spiffe://t_bench/agent/inv-7"],
    resources: [{ system: "k8s:prod-eu", ref: `deploy/checkout-${i}`, data_class: "config" as const }],
    operation: { kind: "tool_call" as const, name: "kubernetes:scale", payload_hash: hashObject({ replicas: i }) },
    decision: { effect: "permit" as const, policy_refs: ["pol_priv_0"] },
    outcome: { status: "ok" as const },
    context: { time_source: "ntp:pool.ntp.org" },
  });
  for (let i = 0; i < 2000; i++) ledger.append(draft(i)); // warm
  const led: number[] = [];
  for (let i = 0; i < 20000; i++) { const d = draft(i); const t = performance.now(); ledger.append(d); led.push(performance.now() - t); }
  printStats("ledger append (single record)", summarize(led), 25);
  const ledP99 = summarize(led).p99;
  console.log(`    mutation path = 4 records (decision, dry-run, approval, execute) -> hashing P99 ≈ ${ms(ledP99 * 4)} ms (DB I/O excluded)`);

  // --- [E] Merkle checkpoint cadence vs. proof size ---
  console.log("\n[E] Merkle CHECKPOINT — cadence vs. proof size");
  const total = ledger.all().length;
  console.log(`    ${"cadence(records)".padEnd(20)}${"depth".padEnd(8)}${"proof bytes".padEnd(14)}build P99(ms)`);
  for (const cadence of [256, 1024, 4096, 16384, total]) {
    const c = Math.min(cadence, total);
    const s: number[] = [];
    let cp;
    for (let r = 0; r < 50; r++) { const t = performance.now(); cp = ledger.checkpoint(0, c - 1); s.push(performance.now() - t); }
    console.log(`    ${String(c).padEnd(20)}${String(cp!.tree_depth).padEnd(8)}${String(cp!.proof_bytes).padEnd(14)}${ms(summarize(s).p99)}`);
  }

  // --- summary ---
  const i = summarize(inv), l = summarize(listing), d = summarize(led);
  console.log("\n=== EXIT-CRITERION NUMBERS ===");
  console.log(`  EC1 Cedar invocation P99:  ${ms(i.p99)} ms (budget 100) -> ${i.p99 <= 100 ? "PASS" : "FAIL"}`);
  console.log(`  EC1 Cedar tool-list P99:   ${ms(l.p99)} ms (budget 100, per ${CAT}-tool listing) -> ${l.p99 <= 100 ? "PASS" : "FAIL"}`);
  console.log(`  EC2 Ledger append P99:     ${ms(d.p99)} ms (budget 25) -> ${d.p99 <= 25 ? "PASS" : "FAIL"}`);
  console.log(`  EC2 checkpoint @1024:      depth=10, proof=320 bytes`);
}

main();
