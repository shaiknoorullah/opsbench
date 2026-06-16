// Connector adapter contract + the shared "translated request" shape.
//
// A connector adapter's ONE job: translate vendor-neutral observability/1
// params into a concrete vendor request (a query string + endpoint + method).
// It does NOT make live calls in this spike — it returns the TranslatedRequest,
// and execution is fed a fixture. This keeps translation (the core deliverable)
// independently assertable from transport.

import type { CapabilityEnvelope } from "./envelope.ts";
import type { ObservabilityVerb, VerbParams } from "./verbs.ts";

/** What an adapter emits: the exact request it WOULD send to the vendor. */
export interface TranslatedRequest {
  vendor: "datadog" | "grafana" | "newrelic";
  /** The vendor query string in its native language (DQL/PromQL/LogQL/NRQL). */
  query: string;
  /** Native query language label, for audit + spend dashboards. */
  language: "datadog_metrics" | "datadog_logs" | "promql" | "logql" | "nrql" | "rest";
  /** HTTP surface the request targets (documented, not executed here). */
  endpoint: { method: "GET" | "POST"; path: string };
  /** Structured body/params for REST-shaped calls (annotations, monitors). */
  request?: Record<string, unknown>;
  /**
   * Escape-hatch marker: when a neutral param cannot be fully expressed and the
   * adapter fell back to vendor-native passthrough, this is set so policy and
   * audit can SEE it. Null means fully expressed via the neutral schema.
   */
  passthrough?: {
    reason: string;
    raw: string; // the vendor-native fragment the agent (or hub) supplied verbatim
  } | null;
}

/** Normalized response shape every adapter parses its vendor fixture into. */
export interface NormalizedResult {
  vendor: TranslatedRequest["vendor"];
  verb: ObservabilityVerb;
  /** Series / rows / logs / trace spans, vendor-normalized to a common envelope. */
  data: unknown;
  served_from: "live" | "cache";
  as_of: string;
}

export interface ConnectorAdapter {
  id: string; // con_datadog_1 etc.
  vendor: TranslatedRequest["vendor"];
  /** Pure translation: neutral params -> vendor request. The assertable core. */
  translate(verb: ObservabilityVerb, params: VerbParams, env: CapabilityEnvelope): TranslatedRequest;
  /** Parse a recorded vendor fixture into the normalized result envelope. */
  parse(verb: ObservabilityVerb, fixture: unknown): NormalizedResult;
}
