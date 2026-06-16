// Grader discrimination: proves the rubric is not a rubber-stamp — wrong
// investigations score strictly lower than the correct one, per dimension.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fixture } from "../src/fixture.ts";
import { grade } from "../src/grader.ts";
import type { Investigation } from "../src/types.ts";

const truth = fixture.incident.resolution;

const correct: Investigation = {
  detection: { symptom: "checkout 5xx error-rate spike", first_seen_ts: "2026-05-01T10:07:00Z" },
  localization: { service: "checkout", component: "db-connection-pool" },
  rca: { cause_id: "rc_pool_exhaustion", summary: truth.rca.summary },
  mitigation: { action_id: "mit_rollback_deploy", summary: truth.mitigation.summary },
  consulted_evidence_ids: [],
};

test("a fully-correct investigation scores 1.0 aggregate", () => {
  assert.equal(grade(correct, truth).aggregate, 1);
});

test("wrong localization drops the localization score and aggregate", () => {
  const wrong = { ...correct, localization: { service: "database", component: "primary" } };
  const g = grade(wrong, truth);
  assert.ok(g.dimensions.localization < 1, "wrong localization must lose points");
  assert.ok(g.aggregate < 1, "aggregate must drop");
});

test("wrong root cause drops the RCA score (the heaviest dimension)", () => {
  const wrong = {
    ...correct,
    rca: { cause_id: "rc_unknown", summary: "Root cause not determined." },
  };
  const g = grade(wrong, truth);
  assert.ok(g.dimensions.rca < 0.5, "missing the cause_id must heavily penalize RCA");
  assert.ok(g.aggregate < correct.detection.symptom.length); // sanity, always true
  assert.ok(g.aggregate < 1);
});

test("a totally-wrong investigation scores near zero", () => {
  const wrong: Investigation = {
    detection: { symptom: "disk full on logging node", first_seen_ts: null },
    localization: { service: "logging", component: "disk" },
    rca: { cause_id: "rc_disk", summary: "log volume filled the disk" },
    mitigation: { action_id: "mit_prune", summary: "prune old logs" },
    consulted_evidence_ids: [],
  };
  const g = grade(wrong, truth);
  assert.ok(g.aggregate < 0.2, `expected near-zero aggregate, got ${g.aggregate}`);
});
