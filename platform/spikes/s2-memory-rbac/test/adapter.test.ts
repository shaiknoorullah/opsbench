// agent-memory-server adapter tests against a MOCK fetch (UNVERIFIED-against-live).
// We do NOT exercise a real server; we assert the adapter's REQUEST SHAPE matches
// the pinned v0.15.2 documented REST contract AND that it never emits a
// blank/default namespace or default user_id.

import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentMemoryServerBackend, AMS_PINNED } from "../src/backend-agent-memory-server.ts";

function mockFetch(captured: any[]): typeof fetch {
  return (async (url: any, init: any) => {
    captured.push({ url: String(url), body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ memories: [{ id: "ams_1", text: "hi", namespace: JSON.parse(init.body)?.memories?.[0]?.namespace }] }),
    } as Response;
  }) as unknown as typeof fetch;
}

test("constructor refuses insecure default (AUTH_MODE=disabled hazard)", () => {
  assert.throws(() => new AgentMemoryServerBackend({ baseUrl: "http://x" }), /AUTH_MODE/);
});

test("write asserts a compiled namespace; rejects blank/default", async () => {
  const captured: any[] = [];
  const b = new AgentMemoryServerBackend({ baseUrl: "http://x", authToken: "tk", fetchImpl: mockFetch(captured) });
  await assert.rejects(() => b.write({ tenant_id: "t_a", namespace: "", text: "x" }));
  await assert.rejects(() => b.write({ tenant_id: "t_a", namespace: "org/default", text: "x" }));
  assert.equal(captured.length, 0, "blank/default namespace reached fetch");
});

test("write request shape matches pinned REST contract", async () => {
  const captured: any[] = [];
  const b = new AgentMemoryServerBackend({ baseUrl: "http://x", authToken: "tk", fetchImpl: mockFetch(captured) });
  await b.write({ tenant_id: "t_a", namespace: "org/acme/dept/eng/team/sre/agent/inv1", text: "hello", topics: ["t1"] });
  const c = captured[0];
  assert.match(c.url, /\/v1\/long-term-memory\/$/);
  assert.equal(Array.isArray(c.body.memories), true);
  const rec = c.body.memories[0];
  assert.equal(rec.namespace, "org/acme/dept/eng/team/sre/agent/inv1");
  assert.equal(rec.user_id, "u:t_a:org_acme_dept_eng_team_sre_agent_inv1");
  assert.notEqual(rec.namespace, "default");
  assert.notEqual(rec.user_id, "default-user");
  assert.equal(rec.memory_type, "semantic");
  assert.equal(c.body.deduplicate, true);
});

test("search uses EXACT namespace eq filter (no prefix/wildcard -> no descendant leak)", async () => {
  const captured: any[] = [];
  const b = new AgentMemoryServerBackend({ baseUrl: "http://x", authToken: "tk", fetchImpl: mockFetch(captured) });
  await b.search({ tenant_id: "t_a", namespace: "org/acme/dept/eng", query: "q", limit: 5 });
  const c = captured[0];
  assert.match(c.url, /\/v1\/long-term-memory\/search$/);
  assert.deepEqual(c.body.namespace, { eq: "org/acme/dept/eng" });
  assert.equal("any" in c.body.namespace, false);
  assert.equal(typeof c.body.namespace.eq, "string");
});

test("search drops any record whose namespace is not an exact match (belt + suspenders)", async () => {
  const leaky: typeof fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      memories: [
        { id: "1", text: "ok", namespace: "org/acme/dept/eng" },
        { id: "2", text: "LEAK", namespace: "org/acme/dept/eng/team/sre" }, // descendant
      ],
    }),
  })) as unknown as typeof fetch;
  const b = new AgentMemoryServerBackend({ baseUrl: "http://x", authToken: "tk", fetchImpl: leaky });
  const out = await b.search({ tenant_id: "t_a", namespace: "org/acme/dept/eng", query: "q", limit: 5 });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.text, "ok");
});

test("pinned defaults documented (forgetting OFF, version 0.15.2)", () => {
  assert.equal(AMS_PINNED.version, "0.15.2");
  assert.equal(AMS_PINNED.defaults.FORGETTING_ENABLED, false);
  assert.equal(AMS_PINNED.defaults.DEFAULT_MCP_NAMESPACE, "default");
  assert.equal(AMS_PINNED.defaults.AUTH_MODE, "disabled");
});
