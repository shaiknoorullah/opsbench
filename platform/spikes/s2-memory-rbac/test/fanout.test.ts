// Recall fan-out tests: merge ordering, annotations, partial-degradation path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryBackend } from "../src/backend-inmemory.ts";
import { recallFanout } from "../src/fanout.ts";
import { MemoryRbacProxy } from "../src/proxy.ts";
import type { MemoryBackend, SearchInput, StoredMemory } from "../src/backend.ts";
import type { IdentityClaims } from "../src/claims.ts";

const agent: IdentityClaims = { tenant_id: "t_a", org: "acme", dept: ["eng"], team: ["sre"], agent: "inv1" };

test("fan-out merges across 4 tiers and annotates each item", async () => {
  const backend = new InMemoryBackend();
  const proxy = new MemoryRbacProxy({ backend });
  // Write at agent tier (own). Seed others directly via backend with tenant fold.
  await proxy.write(agent, { text: "alpha agent memory", trust_label: "feedback_memory", source_event: "inc_1" });
  backend.seed({ tenant_id: "t_a", namespace: "t/t_a/org/acme/dept/eng/team/sre", text: "alpha team memory", trust_label: "runbook", source_event: "inc_2" });
  backend.seed({ tenant_id: "t_a", namespace: "t/t_a/org/acme/dept/eng", text: "alpha dept memory" });
  backend.seed({ tenant_id: "t_a", namespace: "t/t_a/org/acme", text: "alpha org memory", trust_label: "verified_fact" });

  const r = await proxy.recall(agent, "alpha memory", { perTierTimeoutMs: 1000, limit: 50 });
  assert.equal(r.partial, false);
  assert.equal(r.tiers.length, 4);
  const tiers = new Set(r.items.map((i) => i.scope_tier));
  assert.ok(tiers.has("agent") && tiers.has("team") && tiers.has("department") && tiers.has("org"));
  // Every item annotated.
  for (const it of r.items) {
    assert.ok(["agent", "team", "department", "org"].includes(it.scope_tier));
    assert.ok("provenance_ref" in it && "trust_label" in it);
    assert.ok(typeof it.score === "number");
  }
});

test("merge orders by recency x relevance (recent + relevant first)", async () => {
  const backend = new InMemoryBackend();
  const now = Date.now();
  // Same relevance text; different ages. Recent should win.
  backend.seed({ tenant_id: "t_a", namespace: "t/t_a/org/acme", text: "match token", created_at: now - 30 * 24 * 3600 * 1000 });
  backend.seed({ tenant_id: "t_a", namespace: "t/t_a/org/acme", text: "match token", created_at: now });
  const r = await recallFanout(backend, "t_a", "match token", ["t/t_a/org/acme"], {
    perTierTimeoutMs: 1000,
    limit: 10,
    now: () => now,
  });
  assert.equal(r.items.length, 2);
  assert.ok(r.items[0]!.created_at > r.items[1]!.created_at, "recent item not ranked first");
  assert.ok(r.items[0]!.score >= r.items[1]!.score);
});

test("per-tier timeout -> PARTIAL results, slow tier flagged, fast tiers kept", async () => {
  const fast = new InMemoryBackend();
  fast.seed({ tenant_id: "t_a", namespace: "t/t_a/org/acme", text: "fast org hit" });

  // A backend where one namespace hangs past the timeout.
  const flaky: MemoryBackend = {
    name: "flaky",
    async write() { throw new Error("unused"); },
    async count() { return 1; },
    async search(input: SearchInput): Promise<StoredMemory[]> {
      if (input.namespace.endsWith("/team/sre/agent/inv1")) {
        await new Promise((res) => setTimeout(res, 200)); // exceeds timeout
        return [];
      }
      return fast.search(input);
    },
  };

  const r = await recallFanout(
    flaky,
    "t_a",
    "fast org hit",
    ["t/t_a/org/acme/dept/eng/team/sre/agent/inv1", "t/t_a/org/acme"],
    { perTierTimeoutMs: 50, limit: 10 },
  );
  assert.equal(r.partial, true, "partial flag not set");
  const timedOut = r.tiers.find((t) => t.status === "timeout");
  assert.ok(timedOut, "no tier flagged as timeout");
  assert.ok(timedOut!.namespace.endsWith("/agent/inv1"));
  // Fast tier still returned its hit.
  assert.ok(r.items.some((i) => i.text === "fast org hit"), "fast-tier results dropped on partial");
});
