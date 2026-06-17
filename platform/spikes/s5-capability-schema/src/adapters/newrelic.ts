// New Relic adapter: neutral observability/1 params -> NRQL (over NerdGraph).
//
// Query-language syntax confirmed against vendor docs:
//   - NRQL: SELECT function(attr) FROM <eventType> WHERE <pred> SINCE <time> [FACET k] [TIMESERIES]
//     https://docs.newrelic.com/docs/nrql/get-started/introduction-nrql-new-relics-query-language/
//   - percentile: SELECT percentile(duration, 99) FROM Transaction WHERE appName = 'x' SINCE 5 minutes ago
//   - error rate: ... WHERE error = true   (boolean predicate)
//   - logs: FROM Log WHERE message LIKE '%needle%'
//   - FACET = group_by; TIMESERIES = time-bucketed series
//   - regex: WHERE attr RLIKE 'pattern'   (NRQL supports RLIKE -> regex IS expressible)
//   - mutations (deployment markers / annotations): NerdGraph GraphQL mutation,
//     the "cleanest API of the set" per research.
//
// New Relic queries event TYPES (Transaction, Log, Span), not raw metric names.
// We map a neutral metric to an attribute on Transaction by convention and flag
// the assumption; a metric that is a dimensional Metric (FROM Metric) is the
// documented remainder and uses the escape hatch.

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

// Escape a value for an NRQL single-quoted string literal. Backslash MUST be
// escaped first, otherwise a literal backslash in the input can break out of the
// quoting (incomplete-sanitization). Then escape the single quote.
const nrqlStr = (v: string): string => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// Escape an already-built query for embedding in a GraphQL double-quoted string.
// Same rule: backslash first, then the double quote.
const gqlStr = (s: string): string => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const NRQL_OP: Record<Filter["op"], (k: string, v: string) => string> = {
  eq: (k, v) => `${k} = '${nrqlStr(v)}'`,
  neq: (k, v) => `${k} != '${nrqlStr(v)}'`,
  regex: (k, v) => `${k} RLIKE '${nrqlStr(v)}'`,
  not_regex: (k, v) => `NOT ${k} RLIKE '${nrqlStr(v)}'`,
};

function whereClause(filters: Filter[] = []): string {
  if (!filters.length) return "";
  return " WHERE " + filters.map((f) => NRQL_OP[f.op](f.key, f.value)).join(" AND ");
}

// Map neutral relative range to NRQL SINCE grammar ("5 minutes ago").
function sinceClause(t: TimeRange): string {
  const m = /^now-(\d+)([smhd])$/.exec(t.from);
  if (!m) return ` SINCE '${t.from}'`;
  const unit = { s: "seconds", m: "minutes", h: "hours", d: "days" }[m[2]!];
  return ` SINCE ${m[1]} ${unit} ago`;
}

function nrqlAgg(a: Aggregation, attr: string): string {
  if (typeof a === "object") return `percentile(${attr}, ${Math.round(a.percentile)})`;
  switch (a) {
    case "avg":
      return `average(${attr})`;
    case "sum":
      return `sum(${attr})`;
    case "min":
      return `min(${attr})`;
    case "max":
      return `max(${attr})`;
    case "count":
      return `count(*)`;
    case "rate":
      return `rate(count(*), 1 second)`;
  }
}

// Convention: a neutral metric maps to an attribute on the Transaction event,
// unless the name looks dotted/dimensional, in which case it's FROM Metric.
function eventTypeFor(metric: string): { from: string; attr: string; dimensional: boolean } {
  if (metric.includes(".")) {
    return { from: "Metric", attr: metric, dimensional: true };
  }
  // e.g. "duration" -> Transaction.duration
  return { from: "Transaction", attr: metric, dimensional: false };
}

export const newrelicAdapter: ConnectorAdapter = {
  id: "con_newrelic_1",
  vendor: "newrelic",

  translate(verb: ObservabilityVerb, params: VerbParams, _env: CapabilityEnvelope): TranslatedRequest {
    switch (verb) {
      case "query_metrics": {
        const p = params as QueryMetricsParams;
        const { from, attr, dimensional } = eventTypeFor(p.metric);
        const where = whereClause(p.filters);
        const facet = p.group_by?.length ? ` FACET ${p.group_by.join(", ")}` : "";
        const since = sinceClause(p.time);

        let select: string;
        let query: string;
        if (p.ratio_over) {
          // error-rate style: percentage(count(*), WHERE ...) is idiomatic NRQL
          const num = (p.filters ?? []).map((f) => NRQL_OP[f.op](f.key, f.value)).join(" AND ");
          query = `SELECT percentage(count(*), WHERE ${num || "true"}) FROM ${from}${facet}${since}`;
        } else {
          select = nrqlAgg(p.aggregation, dimensional ? `\`${attr}\`` : attr);
          query = `SELECT ${select} FROM ${from}${where}${facet}${since}`;
        }

        return {
          vendor: "newrelic",
          query,
          language: "nrql",
          endpoint: { method: "POST", path: "/graphql" },
          request: {
            graphql: `{ actor { account(id: $acct) { nrql(query: "${gqlStr(query)}") { results } } } }`,
          },
          passthrough: dimensional
            ? {
                reason:
                  "Neutral metric resolved to a dimensional New Relic Metric (FROM Metric); attribute/facet mapping is heuristic and flagged for review",
                raw: `FROM Metric SELECT ${attr}`,
              }
            : null,
        };
      }
      case "search_logs": {
        const p = params as SearchLogsParams;
        const preds: string[] = (p.filters ?? []).map((f) => NRQL_OP[f.op](f.key, f.value));
        if (p.contains) preds.push(`message LIKE '%${nrqlStr(p.contains)}%'`);
        const where = preds.length ? ` WHERE ${preds.join(" AND ")}` : "";
        const since = sinceClause(p.time);
        const limit = ` LIMIT ${p.limit ?? 100}`;
        const query = `SELECT message, timestamp FROM Log${where}${since}${limit}`;
        return {
          vendor: "newrelic",
          query,
          language: "nrql",
          endpoint: { method: "POST", path: "/graphql" },
          request: {
            graphql: `{ actor { account(id: $acct) { nrql(query: "${gqlStr(query)}") { results } } } }`,
          },
          passthrough: null,
        };
      }
      case "get_trace": {
        const p = params as GetTraceParams;
        // Distributed trace spans live in the Span event, keyed by trace.id.
        const since = p.time ? sinceClause(p.time) : " SINCE 1 hour ago";
        const query = `SELECT * FROM Span WHERE trace.id = '${nrqlStr(p.trace_id)}'${since} LIMIT MAX`;
        return {
          vendor: "newrelic",
          query,
          language: "nrql",
          endpoint: { method: "POST", path: "/graphql" },
          request: {
            graphql: `{ actor { account(id: $acct) { nrql(query: "${gqlStr(query)}") { results } } } }`,
          },
          passthrough: null,
        };
      }
      case "list_monitors": {
        // NRQL cannot enumerate alert conditions; that is NerdGraph entity search.
        const p = params as ListMonitorsParams;
        const tagPreds = (p.filters ?? [])
          .map((f) => `tags.${f.key} ${f.op === "neq" ? "!=" : "="} '${nrqlStr(f.value)}'`)
          .join(" AND ");
        return {
          vendor: "newrelic",
          query: `domain = 'AIOPS' AND type = 'CONDITION'${tagPreds ? ` AND ${tagPreds}` : ""}`,
          language: "rest",
          endpoint: { method: "POST", path: "/graphql" },
          request: {
            graphql: `{ actor { entitySearch(query: "type = 'CONDITION'") { results { entities { name alertSeverity } } } } }`,
            state: p.state,
          },
          passthrough:
            p.state && p.state !== "all"
              ? {
                  reason:
                    "New Relic alert state is on the incident/issue entity, not the condition; state filter resolved via NrAiIncident query",
                  raw: `state=${p.state}`,
                }
              : null,
        };
      }
      case "write_annotation": {
        const p = params as WriteAnnotationParams;
        // Deployment marker via NerdGraph changeTracking mutation ("cleanest API").
        const query = `mutation { changeTrackingCreateDeployment(deployment: { entityGuid: "${gqlStr(p.target?.service ?? "")}", version: "annotation", description: "${gqlStr(p.text)}" }) { deploymentId } }`;
        return {
          vendor: "newrelic",
          query,
          language: "rest",
          endpoint: { method: "POST", path: "/graphql" },
          request: { graphql: query, tags: p.tags, at: p.at },
          passthrough: null,
        };
      }
    }
  },

  parse(verb: ObservabilityVerb, fixture: unknown): NormalizedResult {
    const f = fixture as Record<string, unknown>;
    // NerdGraph nests results under data.actor.account.nrql.results
    const results =
      (((f.data as Record<string, unknown>)?.actor as Record<string, unknown>)?.account as Record<
        string,
        unknown
      >) ?? f.results ?? f.data ?? f;
    return {
      vendor: "newrelic",
      verb,
      data: results,
      served_from: "live",
      as_of: (f.as_of as string) ?? new Date(0).toISOString(),
    };
  },
};
