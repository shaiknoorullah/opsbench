// Grafana adapter: neutral observability/1 params -> PromQL (metrics, via the
// Prometheus datasource) + LogQL (logs, via the Loki datasource) + Grafana
// Annotations API + Alerting Provisioning API.
//
// Query-language syntax confirmed against vendor docs:
//   - PromQL p99 from histogram:
//       histogram_quantile(0.99, sum(rate(<metric>_bucket{...}[5m])) by (le))
//     error-rate ratio:
//       sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
//     label matchers: =, !=, =~, !~   (regex IS first-class — strength vs Datadog)
//     https://prometheus.io/docs/prometheus/latest/querying/functions/
//   - LogQL: {label="v"} |= "needle" |~ "regex" != "x"  |  | json | dur > 10s
//     https://grafana.com/docs/loki/latest/query/log_queries/
//   - Annotations: POST /api/annotations ; Alert rules: GET /api/v1/provisioning/alert-rules
//     (mcp-grafana honors --disable-write by default per research)

import type { ConnectorAdapter, NormalizedResult, TranslatedRequest } from "../connector.ts";
import type { CapabilityEnvelope } from "../envelope.ts";
import type {
  Aggregation,
  Filter,
  GetTraceParams,
  ListMonitorsParams,
  ObservabilityVerb,
  QueryMetricsParams,
  SearchLogsParams,
  TimeRange,
  VerbParams,
  WriteAnnotationParams,
} from "../verbs.ts";

const PROM_OP: Record<Filter["op"], string> = {
  eq: "=",
  neq: "!=",
  regex: "=~",
  not_regex: "!~",
};

function promMatchers(filters: Filter[] = []): string {
  return filters.map((f) => `${f.key}${PROM_OP[f.op]}"${f.value}"`).join(",");
}

// Convert relative "now-5m" range into a PromQL range-vector window like [5m].
function rangeWindow(t: TimeRange): string {
  const m = /^now-(\d+[smhd])$/.exec(t.from);
  return m ? `[${m[1]}]` : "[5m]";
}

function promAgg(a: Aggregation): "sum" | "avg" | "min" | "max" | "count" {
  if (typeof a === "object") return "sum"; // percentile handled separately
  if (a === "rate") return "sum";
  if (a === "count") return "count";
  return a;
}

const LOGQL_LINE_OP: Record<Filter["op"], string> = {
  eq: "|=",
  neq: "!=",
  regex: "|~",
  not_regex: "!~",
};

export const grafanaAdapter: ConnectorAdapter = {
  id: "con_grafana_1",
  vendor: "grafana",

  translate(verb: ObservabilityVerb, params: VerbParams, _env: CapabilityEnvelope): TranslatedRequest {
    switch (verb) {
      case "query_metrics": {
        const p = params as QueryMetricsParams;
        const matchers = promMatchers(p.filters);
        const win = rangeWindow(p.time);
        const by = p.group_by?.length ? ` by (${p.group_by.join(",")})` : "";
        let query: string;

        if (typeof p.aggregation === "object") {
          // histogram_quantile over the *_bucket series; `le` always preserved.
          const byLe = p.group_by?.length ? `(le,${p.group_by.join(",")})` : "(le)";
          const phi = (p.aggregation.percentile / 100).toString();
          query = `histogram_quantile(${phi}, sum(rate(${p.metric}_bucket{${matchers}}${win})) by ${byLe})`;
        } else if (p.aggregation === "rate") {
          query = `sum(rate(${p.metric}{${matchers}}${win}))${by}`;
        } else {
          query = `${promAgg(p.aggregation)}(rate(${p.metric}{${matchers}}${win}))${by}`;
        }

        if (p.ratio_over) {
          const dm = promMatchers(p.ratio_over.filters);
          const denom = `sum(rate(${p.ratio_over.metric}{${dm}}${win}))${by}`;
          // numerator must itself be summed-rate for a valid ratio
          const num = `sum(rate(${p.metric}{${matchers}}${win}))${by}`;
          query = `${num} / ${denom}`;
        }

        return {
          vendor: "grafana",
          query,
          language: "promql",
          endpoint: { method: "GET", path: "/api/datasources/proxy/prometheus/api/v1/query_range" },
          request: { query, start: p.time.from, end: p.time.to },
          passthrough: null, // PromQL expresses regex + ratios natively
        };
      }
      case "search_logs": {
        const p = params as SearchLogsParams;
        // Label matchers (eq/neq/regex) become the {stream selector}; free text +
        // remaining ops become |= / |~ line filters.
        const streamFilters = (p.filters ?? []).filter((f) => f.op === "eq" || f.op === "neq");
        const stream = streamFilters
          .map((f) => `${f.key}${PROM_OP[f.op]}"${f.value}"`)
          .join(",");
        const lineFilters = (p.filters ?? []).filter((f) => f.op === "regex" || f.op === "not_regex");
        let query = `{${stream}}`;
        for (const f of lineFilters) query += ` ${LOGQL_LINE_OP[f.op]} \`${f.value}\``;
        if (p.contains) query += ` |= \`${p.contains}\``;
        return {
          vendor: "grafana",
          query,
          language: "logql",
          endpoint: { method: "GET", path: "/api/datasources/proxy/loki/loki/api/v1/query_range" },
          request: { query, start: p.time.from, end: p.time.to, limit: p.limit ?? 100 },
          passthrough: null,
        };
      }
      case "get_trace": {
        const p = params as GetTraceParams;
        // Tempo trace-by-id endpoint.
        return {
          vendor: "grafana",
          query: p.trace_id,
          language: "rest",
          endpoint: { method: "GET", path: `/api/datasources/proxy/tempo/api/traces/${p.trace_id}` },
          request: { traceId: p.trace_id },
          passthrough: null,
        };
      }
      case "list_monitors": {
        // Grafana alert rules via Provisioning API; neutral filters become a
        // post-fetch label filter (the API returns all rules in a folder).
        const p = params as ListMonitorsParams;
        return {
          vendor: "grafana",
          query: (p.filters ?? []).map((f) => `${f.key}=${f.value}`).join(","),
          language: "rest",
          endpoint: { method: "GET", path: "/api/v1/provisioning/alert-rules" },
          request: { labelFilter: p.filters ?? [], state: p.state },
          passthrough:
            p.state && p.state !== "all"
              ? {
                  reason:
                    "Grafana Provisioning API returns rule definitions, not live alert state; state filter applied client-side from /api/alertmanager",
                  raw: `state=${p.state}`,
                }
              : null,
        };
      }
      case "write_annotation": {
        const p = params as WriteAnnotationParams;
        return {
          vendor: "grafana",
          query: p.text,
          language: "rest",
          endpoint: { method: "POST", path: "/api/annotations" },
          request: {
            text: p.text,
            time: p.at,
            tags: [...(p.tags ?? []), ...(p.target?.service ? [`service:${p.target.service}`] : [])],
            dashboardUID: p.target?.dashboard,
          },
          passthrough: null,
        };
      }
    }
  },

  parse(verb: ObservabilityVerb, fixture: unknown): NormalizedResult {
    const f = fixture as Record<string, unknown>;
    const data = (f.data as { result?: unknown })?.result ?? f.data ?? f;
    return {
      vendor: "grafana",
      verb,
      data,
      served_from: "live",
      as_of: (f.as_of as string) ?? new Date(0).toISOString(),
    };
  },
};
