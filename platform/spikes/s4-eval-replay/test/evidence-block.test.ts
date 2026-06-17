// Criterion 3: the run's evidence record satisfies the AutonomyCertificate
// `evidence` block shape (eval_runs / thresholds / window{from,to,sample_size})
// and validates against the committed schema.

import { test } from "node:test";
import assert from "node:assert/strict";

import { fixture } from "../src/fixture.ts";
import { DeterministicInvestigator } from "../src/investigator.ts";
import { buildCertificate, emitEvidenceBlock, replayBatch } from "../src/harness.ts";
import { autonomyCertificateValidator } from "../src/schema.ts";

const thresholds = { rca_accuracy: ">=0.85", localization_accuracy: ">=0.9", aggregate: ">=0.8" };

test("evidence block has the required shape", () => {
  const runs = replayBatch(fixture, new DeterministicInvestigator(), 3, 42);
  const ev = emitEvidenceBlock(fixture, runs, thresholds);

  assert.ok(Array.isArray(ev.eval_runs) && ev.eval_runs.length === 3);
  for (const id of ev.eval_runs) {
    assert.match(id, /^evr_[0-9A-HJKMNP-TV-Z]{26}$/, `eval_run id ${id} must match schema pattern`);
  }
  assert.ok(Object.keys(ev.thresholds).length >= 1);
  assert.equal(ev.window.sample_size, 3);
  assert.equal(ev.window.from, fixture.incident.window.opened_ts);
  assert.equal(ev.window.to, fixture.incident.window.cutoff_ts);
});

test("eval_run ids are unique across the batch", () => {
  const runs = replayBatch(fixture, new DeterministicInvestigator(), 3, 42);
  const ids = runs.map((r) => r.eval_run_id);
  assert.equal(new Set(ids).size, ids.length, "eval_run ids must be unique");
});

test("full AutonomyCertificate validates against the committed schema", () => {
  const runs = replayBatch(fixture, new DeterministicInvestigator(), 3, 42);
  const ev = emitEvidenceBlock(fixture, runs, thresholds);
  const cert = buildCertificate(fixture, ev);

  const validate = autonomyCertificateValidator();
  const ok = validate(cert);
  if (!ok) console.error(validate.errors);
  assert.ok(ok, "certificate (with emitted evidence block) must validate against autonomy-certificate.json");
});

test("an evidence block with an empty eval_runs array is REJECTED by the schema", () => {
  // Negative control — proves we're actually validating, not rubber-stamping.
  const runs = replayBatch(fixture, new DeterministicInvestigator(), 3, 42);
  const ev = emitEvidenceBlock(fixture, runs, thresholds);
  const cert = buildCertificate(fixture, ev);
  (cert.evidence.eval_runs as string[]) = []; // violate minItems:1
  const validate = autonomyCertificateValidator();
  assert.equal(validate(cert), false, "schema must reject empty eval_runs (minItems:1)");
});

test("a malformed eval_run id is REJECTED by the schema", () => {
  const runs = replayBatch(fixture, new DeterministicInvestigator(), 3, 42);
  const ev = emitEvidenceBlock(fixture, runs, thresholds);
  const cert = buildCertificate(fixture, ev);
  cert.evidence.eval_runs[0] = "not-a-valid-evr-id";
  const validate = autonomyCertificateValidator();
  assert.equal(validate(cert), false, "schema must reject a non-pattern eval_run id");
});
