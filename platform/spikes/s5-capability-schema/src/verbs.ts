// observability/1 verb-param schemas — the vendor-NEUTRAL contract agents see.
//
// These are the schema-versioned `params` shapes for each verb of the
// CapabilityEnvelope (spec 01-schemas §8). The whole point of S5: an agent
// authors ONE of these param objects and it routes to ANY backend connector
// without the agent knowing which. Adapters (src/adapters/*) translate these
// neutral params into Datadog / PromQL+LogQL / NRQL query strings.
//
// Versioning: the domain carries the version (`observability/1`). A breaking
// change to any verb-param shape bumps the domain to observability/2 and BOTH
// can be served concurrently by registering two verb tables. We model that
// explicitly with VERB_SCHEMA_VERSION + the `paramsVersion` field so a v1
// envelope is never silently interpreted under v2 semantics.

export const VERB_SCHEMA_VERSION = "observability/1" as const;

export type ObservabilityVerb =
  | "query_metrics"
  | "search_logs"
  | "get_trace"
  | "list_monitors"
  | "write_annotation";

// --- shared neutral primitives ---

/** Relative ("now-5m") or absolute RFC3339; adapters map to each vendor's window grammar. */
export interface TimeRange {
  from: string; // e.g. "now-5m" | "2026-06-16T10:00:00Z"
  to: string; //   e.g. "now"   | "2026-06-16T10:05:00Z"
}

/** A neutral tag/label filter. `op` chosen to be expressible in ALL four target languages. */
export interface Filter {
  key: string;
  op: "eq" | "neq" | "regex" | "not_regex";
  value: string;
}

/** Neutral statistical aggregation requested over the series. */
export type Aggregation =
  | "avg"
  | "sum"
  | "min"
  | "max"
  | "count"
  | "rate"
  | { percentile: number }; // e.g. { percentile: 99 } -> p99

// --- verb param shapes (observability/1) ---

export interface QueryMetricsParams {
  paramsVersion: 1;
  /** Neutral metric name. Adapters map to vendor metric/event-attribute naming. */
  metric: string;
  aggregation: Aggregation;
  filters?: Filter[];
  /** Group results by these tag keys (PromQL `by`, Datadog `by{}`, NRQL FACET). */
  group_by?: string[];
  time: TimeRange;
  /** Optional secondary metric for ratio queries (error-rate style num/denom). */
  ratio_over?: { metric: string; filters?: Filter[] };
}

export interface SearchLogsParams {
  paramsVersion: 1;
  filters?: Filter[];
  /** Free-text / substring needle (used for trace-id correlation, error strings). */
  contains?: string;
  time: TimeRange;
  limit?: number;
}

export interface GetTraceParams {
  paramsVersion: 1;
  trace_id: string;
  time?: TimeRange;
}

export interface ListMonitorsParams {
  paramsVersion: 1;
  filters?: Filter[]; // by tag/service
  state?: "alert" | "ok" | "warn" | "no_data" | "all";
}

export interface WriteAnnotationParams {
  paramsVersion: 1;
  text: string;
  /** Annotation/marker time; defaults to now if omitted. */
  at?: string;
  tags?: string[];
  /** Correlate the annotation to a service/scope so backends can attach it. */
  target?: { service?: string; dashboard?: string };
}

export type VerbParams =
  | QueryMetricsParams
  | SearchLogsParams
  | GetTraceParams
  | ListMonitorsParams
  | WriteAnnotationParams;

/** Map of verb -> a runtime guard, kept tiny (the JSON Schema below is the real gate). */
export function verbOf(capability: string): ObservabilityVerb {
  const [domain, verb] = capability.split(":");
  if (domain !== VERB_SCHEMA_VERSION) {
    throw new Error(
      `unsupported capability domain ${domain}; this connector hub speaks ${VERB_SCHEMA_VERSION}`,
    );
  }
  return verb as ObservabilityVerb;
}
