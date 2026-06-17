// Demo entrypoint: runs the full S4 flow and prints a human-readable report.
//   npm run demo

import { fixture } from "./fixture.ts";
import { DeterministicInvestigator } from "./investigator.ts";
import {
  aggregateVariance,
  buildCertificate,
  emitEvidenceBlock,
  perDimensionVariance,
  replayBatch,
} from "./harness.ts";
import { autonomyCertificateValidator } from "./schema.ts";

const agent = new DeterministicInvestigator();
const N = 3;
const runs = replayBatch(fixture, agent, N, /*seed*/ 42);

console.log(`S4 Time-Travel Eval Replay — ${agent.name}`);
console.log(`Incident: ${fixture.incident.incident_id} (${fixture.incident.scenario_class})`);
console.log(`Window cutoff: ${fixture.incident.window.cutoff_ts}\n`);

console.log("Per-run grades:");
for (const r of runs) {
  console.log(
    `  ${r.eval_run_id}  agg=${r.grade.aggregate}  ` +
      `det=${r.grade.dimensions.detection} loc=${r.grade.dimensions.localization} ` +
      `rca=${r.grade.dimensions.rca} mit=${r.grade.dimensions.mitigation}  ` +
      `denied=${r.denied_accesses} hidden=${r.hidden_ids.length}`,
  );
}

const agg = aggregateVariance(runs);
console.log(`\nStability across ${N} reruns:`);
console.log(`  aggregate scores: [${agg.scores.join(", ")}]`);
console.log(`  mean=${agg.mean} variance=${agg.variance} stddev=${agg.stddev}`);
console.log(`  per-dimension variance:`, perDimensionVariance(runs));

const thresholds = {
  rca_accuracy: ">=0.85",
  localization_accuracy: ">=0.9",
  aggregate: ">=0.8",
};
const evidence = emitEvidenceBlock(fixture, runs, thresholds);
console.log(`\nEmitted AutonomyCertificate evidence block:`);
console.log(JSON.stringify(evidence, null, 2));

const cert = buildCertificate(fixture, evidence);
const validate = autonomyCertificateValidator();
const ok = validate(cert);
console.log(`\nAutonomyCertificate validates against schema: ${ok}`);
if (!ok) {
  console.error(validate.errors);
  process.exitCode = 1;
}

console.log(
  `\nTemporal isolation: ${runs[0]!.hidden_ids.length} post-cutoff item(s) hidden, ` +
    `${runs[0]!.denied_accesses} denial(s) logged per run.`,
);
