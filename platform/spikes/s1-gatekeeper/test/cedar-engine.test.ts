// EC1 (mechanism): Cedar both phases behave correctly against the reference set.
// Latency is asserted in bench.ts, not here (tests stay fast and deterministic).

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateReferenceSet } from "../src/reference-set.ts";
import { CedarEngine, CEDAR_VERSION } from "../src/cedar-engine.ts";

const ref = generateReferenceSet({ teams: 6, toolsPerTeam: 21 });
const engine = new CedarEngine(ref.policies, ref.entities);

test("uses the real Cedar engine (version string present)", () => {
  assert.match(CEDAR_VERSION, /^\d+\.\d+\.\d+/);
});

test("default-deny: unknown principal on unknown resource is denied", () => {
  const d = engine.authorize({
    principal: { type: "Agent", id: "ghost" },
    action: { type: "Action", id: "invoke" },
    resource: { type: "Tool", id: "t0-tool-1" },
    context: {},
  });
  assert.equal(d.effect, "deny");
});

test("forbid guard overrides team permit on prod+danger tools", () => {
  // tool k=0 of any team is danger (k%7==0) and env prod (k%3==0).
  const d = engine.authorize({
    principal: { type: "Agent", id: "t1-agent-0" },
    action: { type: "Action", id: "invoke" },
    resource: { type: "Tool", id: "t1-tool-0" },
    context: {},
  });
  assert.equal(d.effect, "deny");
  assert.ok(d.reasonPolicies.includes("pol_guard_prod_danger"));
});

test("team member may invoke a non-prod own-team tool (permit)", () => {
  // k=1 -> env staging, non-danger
  const d = engine.authorize({
    principal: { type: "Agent", id: "t2-agent-1" },
    action: { type: "Action", id: "invoke" },
    resource: { type: "Tool", id: "t2-tool-1" },
    context: {},
  });
  assert.equal(d.effect, "permit");
});

test("cross-team invocation is denied (no permit applies)", () => {
  const d = engine.authorize({
    principal: { type: "Agent", id: "t0-agent-1" },
    action: { type: "Action", id: "invoke" },
    resource: { type: "Tool", id: "t3-tool-1" }, // other team's tool
    context: {},
  });
  assert.equal(d.effect, "deny");
});

test("phase (a) tool-list filtering returns only PERMITted tools (partial eval)", () => {
  const principal = { type: "Agent", id: "t2-agent-1" };
  const candidates = ref.tools
    .filter((t) => t.startsWith("t2-tool-") || t.startsWith("t3-tool-"))
    .map((id) => ({ type: "Tool", id }));
  const { visible, strategy } = engine.filterTools(
    principal,
    { type: "Action", id: "invoke" },
    {},
    candidates,
  );
  assert.equal(strategy, "per-tool");
  // visible set must be a subset and must contain only own-team, invocable tools.
  assert.ok(visible.length > 0 && visible.length < candidates.length);
  for (const v of visible) {
    const d = engine.authorize({ principal, action: { type: "Action", id: "invoke" }, resource: v, context: {} });
    assert.equal(d.effect, "permit", `visible tool ${v.id} should be permit`);
  }
  // every other-team tool must be excluded
  assert.ok(visible.every((v) => v.id.startsWith("t2-tool-")));
});

test("identical (principal, action, resource, context) yields identical effect (determinism, GOV-002)", () => {
  const req = {
    principal: { type: "Agent", id: "t2-agent-1" },
    action: { type: "Action", id: "invoke" },
    resource: { type: "Tool", id: "t2-tool-1" },
    context: { freeze: false },
  };
  const a = engine.authorize(req);
  const b = engine.authorize(req);
  assert.deepEqual(a, b);
});
