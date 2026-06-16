// Criterion 2: grading rubric produces STABLE scores across 3 reruns.
//
// With the deterministic investigator the variance is exactly 0 — same evidence,
// same rules, same grades. The test asserts zero variance and reports the
// numbers. (Real-LLM variance is a separate, out-of-scope question.)

import { test } from "node:test";
import assert from "node:assert/strict";

import { fixture } from "../src/fixture.ts";
import { DeterministicInvestigator } from "../src/investigator.ts";
import { aggregateVariance, perDimensionVariance, replayBatch } from "../src/harness.ts";

test("3 reruns produce identical aggregate scores (zero variance)", () => {
  const runs = replayBatch(fixture, new DeterministicInvestigator(), 3, 42);
  assert.equal(runs.length, 3);
  const { variance, stddev, scores, mean } = aggregateVariance(runs);
  // Report for the record.
  console.log(`  aggregate scores=[${scores.join(", ")}] mean=${mean} variance=${variance} stddev=${stddev}`);
  assert.equal(variance, 0, "aggregate score variance must be 0 for the deterministic agent");
  assert.equal(new Set(scores).size, 1, "all reruns must yield the identical aggregate score");
});

test("3 reruns produce identical per-dimension scores", () => {
  const runs = replayBatch(fixture, new DeterministicInvestigator(), 3, 42);
  const v = perDimensionVariance(runs);
  console.log(`  per-dimension variance=${JSON.stringify(v)}`);
  for (const [dim, variance] of Object.entries(v)) {
    assert.equal(variance, 0, `${dim} variance must be 0`);
  }
});

test("the investigation object itself is byte-identical across reruns", () => {
  const runs = replayBatch(fixture, new DeterministicInvestigator(), 3, 42);
  const a = JSON.stringify(runs[0]!.investigation);
  for (const r of runs.slice(1)) {
    assert.equal(JSON.stringify(r.investigation), a, "investigation output drifted between reruns");
  }
});

test("aggregate score meets the spike's documented quality bar", () => {
  const runs = replayBatch(fixture, new DeterministicInvestigator(), 3, 42);
  // Sanity: the deterministic agent should score well on this solvable incident.
  assert.ok(runs[0]!.grade.aggregate >= 0.8, `aggregate ${runs[0]!.grade.aggregate} below 0.8 bar`);
});
