// Criterion 1: temporal isolation.
//
// Seeds post-cutoff evidence and proves it is inaccessible to the replayed agent
// across every access surface (list / query / getById), and that the block is
// LOGGED as a denial.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fixture } from "../src/fixture.ts";
import { PostCutoffAccessError, TemporalEvidenceProvider } from "../src/evidence-provider.ts";
import { DeterministicInvestigator } from "../src/investigator.ts";
import { replayOnce } from "../src/harness.ts";
import type { EvidenceItem } from "../src/types.ts";

const CUTOFF = fixture.incident.window.cutoff_ts;

// A freshly-seeded post-cutoff item the agent must NEVER see.
const LEAK: EvidenceItem = {
  id: "ev_seeded_leak",
  ts: "2026-05-01T12:00:00Z", // well after cutoff 10:45
  kind: "log",
  source: "k8s:prod-eu/checkout",
  body: "ROOT CAUSE CONFIRMED: rev 7f3a maxPoolSize=2. FIX: rollback. (hindsight leak)",
  tags: { service: "checkout", reveals: "everything" },
};

test("post-cutoff item is filtered out of list()", () => {
  const provider = new TemporalEvidenceProvider([...fixture.evidence, LEAK], CUTOFF);
  const visible = provider.list();
  const ids = visible.map((e) => e.id);
  assert.ok(!ids.includes(LEAK.id), "leaked item must not appear in list()");
  assert.ok(!ids.includes("ev_post_rollback"), "fixture post-cutoff items must be hidden");
  assert.ok(!ids.includes("ev_post_recovered"));
  // Every returned item is within the window.
  for (const e of visible) {
    assert.ok(Date.parse(e.ts) <= Date.parse(CUTOFF), `${e.id} leaked past cutoff`);
  }
});

test("post-cutoff item is never matched by query()", () => {
  const provider = new TemporalEvidenceProvider([...fixture.evidence, LEAK], CUTOFF);
  const hits = provider.query({ service: "checkout" });
  assert.ok(!hits.some((e) => e.id === LEAK.id));
});

test("getById on a post-cutoff item BLOCKS, throws, and logs a denial", () => {
  const provider = new TemporalEvidenceProvider([...fixture.evidence, LEAK], CUTOFF);
  assert.throws(
    () => provider.getById(LEAK.id),
    (err: unknown) => err instanceof PostCutoffAccessError && (err as PostCutoffAccessError).evidenceId === LEAK.id,
    "direct access to a post-cutoff id must throw PostCutoffAccessError",
  );
  // The blocked access is logged as a denial.
  const denials = provider.getAccessLog().filter((e) => e.effect === "deny");
  assert.ok(
    denials.some((d) => d.evidence_id === LEAK.id),
    "the blocked access must be recorded in the access log as a denial",
  );
});

test("pre-cutoff items remain accessible", () => {
  const provider = new TemporalEvidenceProvider([...fixture.evidence, LEAK], CUTOFF);
  const alert = provider.getById("ev_002"); // ts 10:07 < cutoff
  assert.equal(alert.id, "ev_002");
});

test("an agent replay cannot reach post-cutoff evidence and logs denials", () => {
  const fx = { incident: fixture.incident, evidence: [...fixture.evidence, LEAK] };
  const run = replayOnce(fx, new DeterministicInvestigator(), "evr_0000000000000000000000TEST");
  // The investigator's consulted ids must contain ZERO post-cutoff ids.
  const postCutoff = new Set(["ev_post_rollback", "ev_post_recovered", LEAK.id]);
  for (const id of run.investigation.consulted_evidence_ids) {
    assert.ok(!postCutoff.has(id), `agent consulted post-cutoff evidence ${id}`);
  }
  // Denials were logged (proof the gate actively fired during the run).
  assert.ok(run.denied_accesses > 0, "expected at least one logged denial during replay");
  assert.equal(run.hidden_ids.length, 3, "expected 3 hidden post-cutoff items (2 fixture + 1 seeded)");
});

test("the agent still solves the incident WITHOUT the hindsight leak", () => {
  // Proves isolation does not break gradeability: the agent reaches the right
  // answer from pre-cutoff evidence alone.
  const run = replayOnce(fixture, new DeterministicInvestigator(), "evr_0000000000000000000000SOLV");
  assert.equal(run.investigation.rca.cause_id, "rc_pool_exhaustion");
  assert.equal(run.investigation.localization.component, "db-connection-pool");
});
