// RBAC access-matrix tests (spec §5 table). One test per matrix cell.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../src/rbac.ts";
import type { IdentityClaims } from "../src/claims.ts";

const agent: IdentityClaims = {
  tenant_id: "t_x",
  org: "acme",
  dept: ["eng"],
  team: ["sre"],
  agent: "inv1",
  principal: "spiffe://t_x/agent/inv1",
};
const human: IdentityClaims = {
  tenant_id: "t_x",
  org: "acme",
  dept: ["eng"],
  team: ["sre"],
  principal: "usr_alice",
};

const OWN = "org/acme/dept/eng/team/sre/agent/inv1";
const TEAM = "org/acme/dept/eng/team/sre";
const DEPT = "org/acme/dept/eng";
const ORG = "org/acme";
const SIBLING_TEAM = "org/acme/dept/eng/team/oncall";
const SIBLING_AGENT = "org/acme/dept/eng/team/sre/agent/inv2";

test("write: own deepest scope PERMIT", () => {
  assert.equal(decide(agent, "write", OWN).effect, "permit");
});
test("write: ancestor scope DENY", () => {
  assert.equal(decide(agent, "write", TEAM).effect, "deny");
  assert.equal(decide(agent, "write", ORG).effect, "deny");
});
test("write: sibling agent DENY", () => {
  assert.equal(decide(agent, "write", SIBLING_AGENT).effect, "deny");
});
test("write: team-shared requires explicit grant", () => {
  assert.equal(decide(agent, "write", TEAM, {}).effect, "deny");
  assert.equal(decide(agent, "write", TEAM, { writeGrants: [TEAM] }).effect, "permit");
});

test("read/recall: own + ancestors PERMIT", () => {
  for (const ns of [OWN, TEAM, DEPT, ORG]) {
    assert.equal(decide(agent, "read", ns).effect, "permit", `read ${ns}`);
    assert.equal(decide(agent, "recall", ns).effect, "permit", `recall ${ns}`);
  }
});
test("read/recall: sibling DENY", () => {
  assert.equal(decide(agent, "read", SIBLING_TEAM).effect, "deny");
  assert.equal(decide(agent, "read", SIBLING_AGENT).effect, "deny");
});
test("read/recall: descendant DENY (team caller cannot read agent child)", () => {
  const teamClaims: IdentityClaims = { tenant_id: "t_x", org: "acme", dept: ["eng"], team: ["sre"], principal: "usr_lead" };
  assert.equal(decide(teamClaims, "read", OWN).effect, "deny"); // OWN is descendant of team
});

test("promote: human within authority PERMIT; NHI DENY", () => {
  assert.equal(decide(human, "promote", TEAM).effect, "permit");
  assert.equal(decide(human, "promote", ORG).effect, "permit");
  assert.equal(decide(agent, "promote", TEAM).effect, "deny"); // NHI
});
test("promote: human cannot promote outside authority", () => {
  assert.equal(decide(human, "promote", SIBLING_TEAM).effect, "deny");
});

test("delete/correct: scope owner PERMIT; NHI DENY; P-ADM PERMIT elsewhere", () => {
  assert.equal(decide(human, "delete", TEAM).effect, "permit"); // owns team scope
  assert.equal(decide(agent, "delete", OWN).effect, "deny"); // NHI denied even on own
  assert.equal(decide(human, "delete", SIBLING_TEAM).effect, "deny"); // not owner
  assert.equal(decide(human, "delete", SIBLING_TEAM, { isPlatformAdmin: true }).effect, "permit");
  // Ancestor != owner: a team-scope human may NOT correct a dept-scope memory
  // without P-ADM (spec: "scope owners + P-ADM"). Ownership is exact-scope.
  assert.equal(decide(human, "correct", DEPT).effect, "deny");
  assert.equal(decide(human, "correct", DEPT, { isPlatformAdmin: true }).effect, "permit");
});
