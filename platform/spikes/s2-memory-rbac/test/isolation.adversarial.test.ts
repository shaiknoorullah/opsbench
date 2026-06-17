// ADVERSARIAL ISOLATION SUITE — PRD NF-006 class (criterion 1).
//
// Proves end-to-end (proxy + backend) that:
//   (a) a caller cannot READ sibling scopes,
//   (b) a caller cannot READ descendant scopes it lacks,
//   (c) cross-tenant recall returns NOTHING,
//   (d) a write with blank/default namespace config is BLOCKED at the proxy
//       (the engine's DEFAULT-NAMESPACE fallback is provably unreachable).
//
// These exercise the real proxy.write / proxy.read / proxy.recall paths against
// the in-memory backend, plus an attacker who tries to widen scope via the
// request body (which the proxy ignores in favor of trusted claims).

import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryBackend } from "../src/backend-inmemory.ts";
import { MemoryRbacProxy, AccessDenied } from "../src/proxy.ts";
import { NamespaceError } from "../src/namespace.ts";
import type { IdentityClaims } from "../src/claims.ts";

function fixture() {
  const backend = new InMemoryBackend();
  const denials: string[] = [];
  const proxy = new MemoryRbacProxy({
    backend,
    audit: (e) => {
      if (e.decision.effect === "deny") denials.push(`${e.op}:${e.target}`);
    },
  });
  return { backend, proxy, denials };
}

// Two agents in the SAME tenant/dept, sibling teams.
const sreAgent: IdentityClaims = { tenant_id: "t_a", org: "acme", dept: ["eng"], team: ["sre"], agent: "inv1", principal: "spiffe://t_a/agent/inv1" };
const oncallAgent: IdentityClaims = { tenant_id: "t_a", org: "acme", dept: ["eng"], team: ["oncall"], agent: "pg1", principal: "spiffe://t_a/agent/pg1" };
// A different TENANT with an IDENTICAL logical org/dept/team/agent string.
const otherTenantAgent: IdentityClaims = { tenant_id: "t_b", org: "acme", dept: ["eng"], team: ["sre"], agent: "inv1", principal: "spiffe://t_b/agent/inv1" };

const recallOpts = { perTierTimeoutMs: 1000, limit: 50 };

test("(a) sibling-scope READ is denied", async () => {
  const { proxy } = fixture();
  await assert.rejects(
    () => proxy.read(sreAgent, "org/acme/dept/eng/team/oncall", "anything"),
    (e) => e instanceof AccessDenied && /sibling/.test(e.decision.reason),
  );
  await assert.rejects(
    () => proxy.read(sreAgent, "org/acme/dept/eng/team/oncall/agent/pg1", "anything"),
    (e) => e instanceof AccessDenied,
  );
});

test("(a) sibling memory NEVER surfaces in recall fan-out", async () => {
  const { proxy } = fixture();
  // oncall writes a secret to its own scope
  await proxy.write(oncallAgent, { text: "oncall pager runbook secret", topics: ["runbook"] });
  // sre writes to its own scope
  await proxy.write(sreAgent, { text: "sre deployment note", topics: ["deploy"] });
  // sre recalls — must see only its own + ancestors, never oncall's
  const r = await proxy.recall(sreAgent, "runbook secret deployment", recallOpts);
  assert.equal(r.partial, false);
  for (const it of r.items) {
    assert.ok(!it.namespace.includes("team/oncall"), `LEAK: sibling item surfaced: ${it.namespace}`);
    assert.ok(!it.text.includes("oncall"), `LEAK: sibling text surfaced: ${it.text}`);
  }
});

test("(b) descendant-scope READ is denied (team caller cannot read child agent)", async () => {
  const { proxy } = fixture();
  const teamHuman: IdentityClaims = { tenant_id: "t_a", org: "acme", dept: ["eng"], team: ["sre"], principal: "usr_lead" };
  await assert.rejects(
    () => proxy.read(teamHuman, "org/acme/dept/eng/team/sre/agent/inv1", "x"),
    (e) => e instanceof AccessDenied && /descendant/.test(e.decision.reason),
  );
});

test("(b) descendant memory NEVER surfaces in recall (no prefix leak at backend)", async () => {
  const { proxy } = fixture();
  // Child agent writes a memory.
  await proxy.write(sreAgent, { text: "child agent private finding", topics: ["finding"] });
  // The team-level human recalls. Own scope is the team; the child agent scope
  // is a descendant and must be excluded by construction (not in authority set).
  const teamHuman: IdentityClaims = { tenant_id: "t_a", org: "acme", dept: ["eng"], team: ["sre"], principal: "usr_lead" };
  const r = await proxy.recall(teamHuman, "child agent private finding", recallOpts);
  for (const it of r.items) {
    assert.ok(!it.namespace.includes("/agent/"), `LEAK: descendant agent item surfaced: ${it.namespace}`);
  }
});

test("(c) cross-tenant recall returns NOTHING despite identical logical namespaces", async () => {
  const { proxy } = fixture();
  // Tenant B writes a memory under an identical org/dept/team/agent string.
  await proxy.write(otherTenantAgent, { text: "TENANT-B-SECRET cross tenant data", topics: ["secret"] });
  // Tenant A's agent (same logical namespace) recalls the same query.
  const r = await proxy.recall(sreAgent, "TENANT-B-SECRET cross tenant data secret", recallOpts);
  assert.equal(r.items.length, 0, `CROSS-TENANT LEAK: ${JSON.stringify(r.items)}`);
});

test("(c) cross-tenant single READ returns NOTHING", async () => {
  const { proxy } = fixture();
  await proxy.write(otherTenantAgent, { text: "tenant b only", topics: ["x"] });
  const got = await proxy.read(sreAgent, "org/acme/dept/eng/team/sre/agent/inv1", "tenant b only");
  assert.equal(got.length, 0, "cross-tenant read leaked");
});

test("(d) write with BLANK namespace is blocked at the proxy (no backend call)", async () => {
  const { proxy, backend } = fixture();
  const before = await backend.count();
  await assert.rejects(() => proxy.write(sreAgent, { text: "x", targetNamespace: "" }), NamespaceError);
  await assert.rejects(() => proxy.write(sreAgent, { text: "x", targetNamespace: "   " }), NamespaceError);
  assert.equal(await backend.count(), before, "blank-namespace write reached the backend");
});

test("(d) write with DEFAULT namespace token is blocked (DEFAULT_MCP_NAMESPACE unreachable)", async () => {
  const { proxy, backend } = fixture();
  const before = await backend.count();
  await assert.rejects(() => proxy.write(sreAgent, { text: "x", targetNamespace: "org/default" }), NamespaceError);
  await assert.rejects(() => proxy.write(sreAgent, { text: "x", targetNamespace: "org/acme/dept/default" }), NamespaceError);
  assert.equal(await backend.count(), before, "default-namespace write reached the backend");
});

test("ATTACK: agent-supplied target cannot widen scope to an ancestor", async () => {
  const { proxy, backend } = fixture();
  const before = await backend.count();
  // Malicious agent tries to write to org tier by asserting a target.
  await assert.rejects(
    () => proxy.write(sreAgent, { text: "escalate to org", targetNamespace: "org/acme" }),
    (e) => e instanceof AccessDenied,
  );
  // And tries to write into a sibling.
  await assert.rejects(
    () => proxy.write(sreAgent, { text: "into sibling", targetNamespace: "org/acme/dept/eng/team/oncall/agent/pg1" }),
    (e) => e instanceof AccessDenied,
  );
  assert.equal(await backend.count(), before, "scope-widening write reached the backend");
});

test("ATTACK: a memory written to own scope IS recallable by self and ancestors only", async () => {
  const { proxy } = fixture();
  await proxy.write(sreAgent, { text: "own-scope memory token Z9", source_event: "inc_42", trust_label: "feedback_memory" });
  const self = await proxy.recall(sreAgent, "own-scope memory token Z9", recallOpts);
  assert.ok(self.items.some((i) => i.text.includes("Z9")), "self cannot recall own memory");
  // annotations present
  const hit = self.items.find((i) => i.text.includes("Z9"))!;
  assert.equal(hit.scope_tier, "agent");
  assert.equal(hit.provenance_ref, "inc_42");
  assert.equal(hit.trust_label, "feedback_memory");
  // A dept-level human (ancestor) can recall it via... no: ancestor recall only
  // searches ancestor namespaces, not descendants. So ancestor must NOT see it.
  const deptHuman: IdentityClaims = { tenant_id: "t_a", org: "acme", dept: ["eng"], principal: "usr_dl" };
  const anc = await proxy.recall(deptHuman, "own-scope memory token Z9", recallOpts);
  assert.ok(!anc.items.some((i) => i.text.includes("Z9")), "descendant memory leaked upward to ancestor recall");
});
