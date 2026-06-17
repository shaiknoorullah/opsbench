// Namespace compiler + algebra tests. Cross-checks compiled namespaces against
// the NORMATIVE memory-scope.json schema (the source of truth) via tsx import.

import { test } from "node:test";
import assert from "node:assert/strict";
import { validator, type MemoryScope } from "../../../packages/schemas/src/index.ts";
import {
  compileCallerNamespace,
  tierOf,
  ancestorsOf,
  readAuthoritySet,
  assertCompiled,
  NamespaceError,
} from "../src/namespace.ts";
import type { IdentityClaims } from "../src/claims.ts";

const v = validator("memoryScope");

function assertSchemaValid(namespace: string, tier: MemoryScope["tier"]): void {
  const obj: MemoryScope = { tenant_id: "t_x", namespace, tier };
  assert.equal(v(obj), true, `schema rejected ${namespace}: ${JSON.stringify(v.errors)}`);
}

test("compiles agent-tier namespace and it validates against memory-scope.json", () => {
  const c: IdentityClaims = { tenant_id: "t_x", org: "acme", dept: ["eng"], team: ["sre"], agent: "inv1" };
  const ns = compileCallerNamespace(c);
  assert.equal(ns, "org/acme/dept/eng/team/sre/agent/inv1");
  assert.equal(tierOf(ns), "agent");
  assertSchemaValid(ns, "agent");
});

test("compiles each tier (org, dept, team, agent) and account branch", () => {
  assert.equal(compileCallerNamespace({ tenant_id: "t", org: "o" }), "org/o");
  assertSchemaValid("org/o", "org");
  assert.equal(compileCallerNamespace({ tenant_id: "t", org: "o", dept: ["d"] }), "org/o/dept/d");
  assertSchemaValid("org/o/dept/d", "department");
  assert.equal(compileCallerNamespace({ tenant_id: "t", org: "o", dept: ["d"], team: ["t1"] }), "org/o/dept/d/team/t1");
  assertSchemaValid("org/o/dept/d/team/t1", "team");
  assert.equal(compileCallerNamespace({ tenant_id: "t", org: "o", account: "crm9" }), "org/o/account/crm9");
  assertSchemaValid("org/o/account/crm9", "account");
});

test("home dept/team are the FIRST elements of the claim arrays", () => {
  const c: IdentityClaims = { tenant_id: "t", org: "o", dept: ["eng", "ops"], team: ["sre", "oncall"] };
  assert.equal(compileCallerNamespace(c), "org/o/dept/eng/team/sre");
});

test("grammar violations are rejected", () => {
  // agent without team
  assert.throws(() => compileCallerNamespace({ tenant_id: "t", org: "o", dept: ["d"], agent: "a" }), NamespaceError);
  // team without dept
  assert.throws(() => compileCallerNamespace({ tenant_id: "t", org: "o", team: ["t1"] }), NamespaceError);
});

test("ancestorsOf returns deepest-first excluding self", () => {
  assert.deepEqual(ancestorsOf("org/o/dept/d/team/t/agent/a"), [
    "org/o/dept/d/team/t",
    "org/o/dept/d",
    "org/o",
  ]);
  assert.deepEqual(ancestorsOf("org/o/account/x"), ["org/o"]);
  assert.deepEqual(ancestorsOf("org/o"), []);
});

test("readAuthoritySet = own + ancestors", () => {
  const set = readAuthoritySet("org/o/dept/d/team/t/agent/a");
  assert.equal(set.size, 4);
  assert.ok(set.has("org/o"));
  assert.ok(set.has("org/o/dept/d/team/t/agent/a"));
  assert.ok(!set.has("org/o/dept/d/team/OTHER"));
});

test("assertCompiled blocks blank, malformed, and default tokens (MEM-002)", () => {
  assert.throws(() => assertCompiled(""), NamespaceError);
  assert.throws(() => assertCompiled("acme/eng"), NamespaceError); // no org/ root
  assert.throws(() => assertCompiled("org/o/widget/x"), NamespaceError); // bad kind
  assert.throws(() => assertCompiled("org/default"), NamespaceError);
  assert.throws(() => assertCompiled("org/o/dept/default"), NamespaceError);
});

test("compiled namespaces never contain a forbidden default token", () => {
  assert.throws(() => compileCallerNamespace({ tenant_id: "t", org: "default" }), NamespaceError);
  assert.throws(
    () => compileCallerNamespace({ tenant_id: "t", org: "o", dept: ["default"] }),
    NamespaceError,
  );
});
