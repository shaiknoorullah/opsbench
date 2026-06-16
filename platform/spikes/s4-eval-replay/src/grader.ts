// Grader — scores an Investigation against the human-confirmed resolution.
//
// Four dimensions, each scored in [0,1], plus a weighted aggregate. The grader
// is pure and deterministic: same (investigation, resolution) -> same scores.
// That property is what lets criterion 2 (stable across reruns) hold for the
// deterministic investigator with EXACTLY ZERO variance.

import type { GradeReport, HumanResolution, Investigation } from "./types.ts";

const WEIGHTS = { detection: 0.2, localization: 0.2, rca: 0.4, mitigation: 0.2 } as const;

/** Normalize for tolerant text comparison: lowercase, collapse whitespace. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Token-overlap (Jaccard) similarity in [0,1] — deterministic. */
function jaccard(a: string, b: string): number {
  const sa = new Set(norm(a).split(" ").filter(Boolean));
  const sb = new Set(norm(b).split(" ").filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function grade(inv: Investigation, truth: HumanResolution): GradeReport {
  // DETECTION: symptom text similarity, with a small bonus for matching the
  // first-seen timestamp exactly (within the window the agent could observe).
  const symptomSim = jaccard(inv.detection.symptom, truth.detection.symptom);
  const tsMatch = inv.detection.first_seen_ts === truth.detection.first_seen_ts ? 1 : 0;
  const detection = round(0.7 * symptomSim + 0.3 * tsMatch);

  // LOCALIZATION: exact service + exact component (0.5 each).
  const localization = round(
    (inv.localization.service === truth.localization.service ? 0.5 : 0) +
      (inv.localization.component === truth.localization.component ? 0.5 : 0),
  );

  // RCA: exact cause_id is the strong signal; summary similarity refines it.
  const causeMatch = inv.rca.cause_id === truth.rca.cause_id ? 1 : 0;
  const rcaSim = jaccard(inv.rca.summary, truth.rca.summary);
  const rca = round(causeMatch === 1 ? 0.7 + 0.3 * rcaSim : 0.3 * rcaSim);

  // MITIGATION: exact action_id + summary similarity.
  const actionMatch = inv.mitigation.action_id === truth.mitigation.action_id ? 1 : 0;
  const mitSim = jaccard(inv.mitigation.summary, truth.mitigation.summary);
  const mitigation = round(actionMatch === 1 ? 0.7 + 0.3 * mitSim : 0.3 * mitSim);

  const aggregate = round(
    WEIGHTS.detection * detection +
      WEIGHTS.localization * localization +
      WEIGHTS.rca * rca +
      WEIGHTS.mitigation * mitigation,
  );

  return { dimensions: { detection, localization, rca, mitigation }, aggregate };
}

/** Fixed 4-dp rounding so floating-point noise never perturbs equality checks. */
function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
