// Datadog adapter: neutral observability/1 params -> Datadog metric query syntax
// + Logs Search API syntax + Events/Monitors REST.
//
// Query-language syntax confirmed against vendor docs:
//   - Metrics: `[aggregator]:[metric]{tag:value,...} by {group}` with p99: prefix.
//     https://docs.datadoghq.com/metrics/advanced-filtering/
//     example: avg:system.cpu.user{env:staging} by {availability-zone}
//   - Logs search: reserved attrs `service:`, `status:`, `trace_id:` (no @),
//     custom attrs `@attr:value`, free text, AND/OR/`-` exclusion.
//     https://docs.datadoghq.com/logs/explorer/search_syntax/
//   - Events v2 / Monitors / annotations are REST (MCP is read-oriented).
//
// Datadog tag filters do NOT support regex inside {}. A neutral `regex` op on a
// metric query is therefore the documented INEXPRESSIBLE remainder -> escape hatch.

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

function aggPrefix(a: Aggregation): string {
  if (typeof a === "object") return `p${Math.round(a.percentile)}`;
  // Datadog space aggregators; `rate` maps to per_second rollup wrapper below.
  return a === "rate" ? "sum" : a === "count" ? "count" : a;
}

// Datadog metric queries support WILDCARD tag filtering (*, ?) but NOT full PCRE
// (confirmed: https://www.datadoghq.com/blog/wildcard-filter-queries/ and
// https://docs.datadoghq.com/metrics/advanced-filtering/). We therefore translate
// the wildcard-equivalent subset of a neutral `regex` op into a Datadog wildcard,
// and escape-hatch only TRUE PCRE features (alternation |, anchors ^$, char
// classes [...], counted quantifiers {n}, groups). `.*` -> `*`, `.` -> `?`.
const PCRE_ONLY = /[|()[\]{}^$+]|\\d|\\w|\\s/;

function regexToWildcard(value: string): { wildcard: string; lossless: boolean } {
  if (PCRE_ONLY.test(value)) return { wildcard: value, lossless: false };
  // Only `.` and `.*` present -> faithfully expressible as Datadog wildcards.
  const wildcard = value.replace(/\.\*/g, "*").replace(/\./g, "?");
  return { wildcard, lossless: true };
}

// Datadog metric tag filter: key:value, joined by comma (implicit AND).
function metricTagFilter(filters: Filter[] = []): { selector: string; inexpressible: Filter[] } {
  const inexpressible: Filter[] = [];
  const parts: string[] = [];
  for (const f of filters) {
    if (f.op === "regex" || f.op === "not_regex") {
      const { wildcard, lossless } = regexToWildcard(f.value);
      if (!lossless) {
        inexpressible.push(f);
        continue;
      }
      const neg = f.op === "not_regex" ? "!" : "";
      parts.push(`${neg}${f.key}:${wildcard}`);
      continue;
    }
    parts.push(f.op === "neq" ? `!${f.key}:${f.value}` : `${f.key}:${f.value}`);
  }
  return { selector: parts.join(","), inexpressible };
}

// Datadog Logs search supports wildcard (*) matching, not PCRE
// (https://docs.datadoghq.com/logs/explorer/search_syntax/). Reserved attrs
// (service/status/host/trace_id/...) take no @ prefix; custom attrs take @.
// A wildcard-equivalent regex translates faithfully; true PCRE is flagged.
function logFilter(f: Filter): { clause: string; inexpressible: boolean } {
  const reserved = new Set(["host", "source", "status", "service", "trace_id", "message"]);
  const key = reserved.has(f.key) ? f.key : `@${f.key}`;
  switch (f.op) {
    case "eq":
      return { clause: `${key}:${f.value}`, inexpressible: false };
    case "neq":
      return { clause: `-${key}:${f.value}`, inexpressible: false };
    case "regex":
    case "not_regex": {
      const { wildcard, lossless } = regexToWildcard(f.value);
      const neg = f.op === "not_regex" ? "-" : "";
      return { clause: `${neg}${key}:${wildcard}`, inexpressible: !lossless };
    }
  }
}

function ddWindow(t: TimeRange): { from: string; to: string } {
  // Datadog accepts `now-5m` / `now` shorthand in the explorer and `from_ts`/`to_ts`
  // epoch in REST; we keep the human shorthand for the assertable query string.
  return { from: t.from, to: t.to };
}

export const datadogAdapter: ConnectorAdapter = {
  id: "con_datadog_1",
  vendor: "datadog",

  translate(verb: ObservabilityVerb, params: VerbParams, _env: CapabilityEnvelope): TranslatedRequest {
    switch (verb) {
      case "query_metrics": {
        const p = params as QueryMetricsParams;
        const { selector, inexpressible } = metricTagFilter(p.filters);
        const group = p.group_by?.length ? ` by {${p.group_by.join(",")}}` : "";
        let query = `${aggPrefix(p.aggregation)}:${p.metric}{${selector}}${group}`;
        if (p.aggregation === "rate") query = `${query}.as_rate()`;
        if (p.ratio_over) {
          const denom = metricTagFilter(p.ratio_over.filters);
          query = `(${query}/${aggPrefix(p.aggregation)}:${p.ratio_over.metric}{${denom.selector}}${group})`;
        }
        const win = ddWindow(p.time);
        return {
          vendor: "datadog",
          query,
          language: "datadog_metrics",
          endpoint: { method: "GET", path: "/api/v1/query" },
          request: { query, from: win.from, to: win.to },
          passthrough:
            inexpressible.length === 0
              ? null
              : {
                  reason: `Datadog metric tag selectors do not support regex; ${inexpressible.length} regex filter(s) require vendor-native passthrough`,
                  raw: inexpressible.map((f) => `${f.key}~${f.value}`).join(","),
                },
        };
      }
      case "search_logs": {
        const p = params as SearchLogsParams;
        const translated = (p.filters ?? []).map(logFilter);
        const clauses = translated.map((t) => t.clause);
        if (p.contains) clauses.push(p.contains); // free text
        const query = clauses.join(" ");
        const inexpressible = translated.filter((t) => t.inexpressible);
        return {
          vendor: "datadog",
          query,
          language: "datadog_logs",
          endpoint: { method: "POST", path: "/api/v2/logs/events/search" },
          request: {
            filter: { query, from: p.time.from, to: p.time.to },
            page: { limit: p.limit ?? 100 },
          },
          passthrough:
            inexpressible.length === 0
              ? null
              : {
                  reason:
                    "Datadog Logs search uses wildcard matching, not PCRE; PCRE-only filters (alternation/char-classes/anchors) require vendor-native passthrough",
                  raw: query,
                },
        };
      }
      case "get_trace": {
        const p = params as GetTraceParams;
        // Trace retrieval = APM trace API by trace_id.
        return {
          vendor: "datadog",
          query: `trace_id:${p.trace_id}`,
          language: "datadog_logs",
          endpoint: { method: "GET", path: `/api/v1/trace/${p.trace_id}` },
          request: { trace_id: p.trace_id },
          passthrough: null,
        };
      }
      case "list_monitors": {
        const p = params as ListMonitorsParams;
        const tagq = (p.filters ?? [])
          .map((f) => (f.op === "neq" ? `-${f.key}:${f.value}` : `${f.key}:${f.value}`))
          .join(" ");
        const stateMap: Record<string, string | undefined> = {
          alert: "Alert",
          ok: "OK",
          warn: "Warn",
          no_data: "No Data",
          all: undefined,
        };
        return {
          vendor: "datadog",
          query: tagq,
          language: "rest",
          endpoint: { method: "GET", path: "/api/v1/monitor" },
          request: {
            monitor_tags: tagq || undefined,
            ...(p.state && p.state !== "all" ? { group_states: stateMap[p.state] } : {}),
          },
          passthrough: null,
        };
      }
      case "write_annotation": {
        const p = params as WriteAnnotationParams;
        // Datadog has no first-class "annotation" — model as an Event (Events v2).
        return {
          vendor: "datadog",
          query: p.text,
          language: "rest",
          endpoint: { method: "POST", path: "/api/v1/events" },
          request: {
            title: p.text.slice(0, 100),
            text: p.text,
            date_happened: p.at,
            tags: [...(p.tags ?? []), ...(p.target?.service ? [`service:${p.target.service}`] : [])],
          },
          passthrough: null,
        };
      }
    }
  },

  parse(verb: ObservabilityVerb, fixture: unknown): NormalizedResult {
    const f = fixture as Record<string, unknown>;
    return {
      vendor: "datadog",
      verb,
      data: f.series ?? f.data ?? f.logs ?? f.monitors ?? f,
      served_from: "live",
      as_of: (f.as_of as string) ?? new Date(0).toISOString(),
    };
  },
};
