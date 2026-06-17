// Replay harness — orchestrates one replay run and a batch of runs, then emits
// the AutonomyCertificate `evidence` block.

import { TemporalEvidenceProvider } from "./evidence-provider.ts";
import type { InvestigatorAgent } from "./investigator.ts";
import { grade } from "./grader.ts";
import { IdFactory } from "./ids.ts";
import type { AutonomyCertificate } from "./schema.ts";
import type { GradeReport, IncidentFixture, Investigation } from "./types.ts";

export interface ReplayRun {
  eval_run_id: string;
  investigation: Investigation;
  grade: GradeReport;
  /** Number of post-cutoff accesses that were blocked + logged during this run. */
  denied_accesses: number;
  /** Post-cutoff ids that existed but were hidden for the whole run. */
  hidden_ids: string[];
}

/** Run a single replay: gate evidence as-of cutoff, investigate, grade. */
export function replayOnce(
  fixture: IncidentFixture,
  agent: InvestigatorAgent,
  evalRunId: string,
): ReplayRun {
  const provider = new TemporalEvidenceProvider(
    fixture.evidence,
    fixture.incident.window.cutoff_ts,
  );
  const investigation = agent.investigate({
    scenario_class: fixture.incident.scenario_class,
    environment: fixture.incident.environment,
    evidence: provider,
  });
  const g = grade(investigation, fixture.incident.resolution);
  return {
    eval_run_id: evalRunId,
    investigation,
    grade: g,
    denied_accesses: provider.deniedCount(),
    hidden_ids: provider.hiddenIds(),
  };
}

/** Run the replay `n` times. Eval-run ids are drawn from a seeded factory. */
export function replayBatch(
  fixture: IncidentFixture,
  agent: InvestigatorAgent,
  n: number,
  seed = 1,
): ReplayRun[] {
  const ids = new IdFactory(seed);
  const runs: ReplayRun[] = [];
  for (let i = 0; i < n; i++) {
    runs.push(replayOnce(fixture, agent, ids.evalRun()));
  }
  return runs;
}

/** Aggregate variance of the aggregate score across runs (population variance). */
export function aggregateVariance(runs: ReplayRun[]): {
  mean: number;
  variance: number;
  stddev: number;
  scores: number[];
} {
  const scores = runs.map((r) => r.grade.aggregate);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  return { mean: r4(mean), variance: r4(variance), stddev: r4(Math.sqrt(variance)), scores };
}

/** Per-dimension variance across runs. */
export function perDimensionVariance(runs: ReplayRun[]): Record<string, number> {
  const dims = ["detection", "localization", "rca", "mitigation"] as const;
  const out: Record<string, number> = {};
  for (const d of dims) {
    const xs = runs.map((r) => r.grade.dimensions[d]);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    out[d] = r4(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  }
  return out;
}

export interface EvidenceBlock {
  eval_runs: string[];
  thresholds: Record<string, string>;
  window: { from: string; to: string; sample_size: number };
}

/**
 * Emit the AutonomyCertificate `evidence` block from a batch of replay runs.
 * - eval_runs: the seeded ids of each replay run.
 * - thresholds: the per-metric gates the batch was held to.
 * - window: the incident window {from,to} and sample_size = number of runs.
 */
export function emitEvidenceBlock(
  fixture: IncidentFixture,
  runs: ReplayRun[],
  thresholds: Record<string, string>,
): EvidenceBlock {
  return {
    eval_runs: runs.map((r) => r.eval_run_id),
    thresholds,
    window: {
      from: fixture.incident.window.opened_ts,
      to: fixture.incident.window.cutoff_ts,
      sample_size: runs.length,
    },
  };
}

/**
 * Wrap an evidence block into a full AutonomyCertificate so it can be validated
 * against the committed schema end-to-end (the `evidence` block is the part S4
 * must satisfy; the surrounding fields are filled with schema-valid values).
 */
export function buildCertificate(
  fixture: IncidentFixture,
  evidence: EvidenceBlock,
  seed = 99,
): AutonomyCertificate {
  const ids = new IdFactory(seed);
  return {
    id: ids.cert(),
    tenant_id: fixture.incident.tenant_id,
    subject: {
      agent: `spiffe://opsbench/agent/replay-${fixture.incident.scenario_class}`,
      scenario_class: fixture.incident.scenario_class,
      environment: fixture.incident.environment,
    },
    level: "L2",
    evidence,
    approved_by: "usr_eval-bot",
    issued_at: "2026-06-12T00:00:00Z",
    expires_at: "2026-09-12T00:00:00Z",
    revocation: { conditions: ["eval_regression", "manual"], status: "active", revoked_at: null, revoked_reason: null },
  };
}

function r4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
