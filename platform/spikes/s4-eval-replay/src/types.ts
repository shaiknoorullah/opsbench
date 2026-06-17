// Domain types for the S4 replay harness.
//
// These are spike-local shapes. The incident-ledger here is a *small* stand-in
// for the full incident-ledger schema (00-architecture C13): it carries just
// enough to (a) seed evidence, (b) record the human-confirmed resolution that
// grading scores against, and (c) define the temporal window.

/** A single timestamped evidence item in the store. */
export interface EvidenceItem {
  id: string;
  /** RFC3339 UTC timestamp. The temporal-isolation predicate is `ts <= cutoff`. */
  ts: string;
  kind: "log" | "metric" | "deploy" | "alert";
  source: string; // e.g. "k8s:prod-eu/checkout", "datadog:org-1"
  /** Free-form body the investigator reads. */
  body: string;
  /** Structured tags the deterministic investigator keys off of. */
  tags: Record<string, string>;
}

/** The human-confirmed ground truth used by the grader. */
export interface HumanResolution {
  /** What was detected (the firing symptom) — for the detection dimension. */
  detection: { symptom: string; first_seen_ts: string };
  /** Where the fault was localized — service / component. */
  localization: { service: string; component: string };
  /** Confirmed root cause — for the RCA dimension. */
  rca: { cause_id: string; summary: string };
  /** Confirmed mitigation action — for the mitigation dimension. */
  mitigation: { action_id: string; summary: string };
}

/** A closed incident, ledger-shaped (small). */
export interface ClosedIncident {
  incident_id: string;
  tenant_id: string;
  scenario_class: string;
  environment: string;
  /** Investigation window. Evidence with ts > window.cutoff is post-incident. */
  window: { opened_ts: string; cutoff_ts: string; closed_ts: string };
  /** Hypotheses the humans tested during the live incident. */
  hypotheses_tested: { id: string; statement: string; verdict: "confirmed" | "rejected" }[];
  /** Actions humans took. */
  actions_taken: { id: string; description: string; ts: string }[];
  /** Outcome flags. */
  outcome_flags: { recovered: boolean; data_loss: boolean; customer_impact: boolean };
  /** Ground-truth resolution. */
  resolution: HumanResolution;
}

/** The full fixture: an incident plus its complete (pre- and post-cutoff) evidence store. */
export interface IncidentFixture {
  incident: ClosedIncident;
  /** Evidence spanning BEFORE and AFTER the cutoff. The harness must hide post-cutoff items. */
  evidence: EvidenceItem[];
}

/** What an investigator produces — the four graded dimensions. */
export interface Investigation {
  detection: { symptom: string; first_seen_ts: string | null };
  localization: { service: string; component: string };
  rca: { cause_id: string; summary: string };
  mitigation: { action_id: string; summary: string };
  /** Ids of evidence items the investigator actually consulted (for audit). */
  consulted_evidence_ids: string[];
}

/** Per-dimension and aggregate grades. */
export interface GradeReport {
  dimensions: {
    detection: number;
    localization: number;
    rca: number;
    mitigation: number;
  };
  aggregate: number;
}
