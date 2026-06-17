// A "sampled real investigation": the queries an SRE issues during a checkout
// latency/error incident, authored ONCE as vendor-neutral CapabilityEnvelopes.
// Each is routed to all three backends; we compute the expressibility % per
// backend = (queries with NO escape-hatch passthrough) / (total).
//
// Run: npm run investigation

import type { CapabilityEnvelope } from "./envelope.ts";
import { ConnectorHub } from "./router.ts";
import { datadogAdapter } from "./adapters/datadog.ts";
import { grafanaAdapter } from "./adapters/grafana.ts";
import { newrelicAdapter } from "./adapters/newrelic.ts";

const TENANT = "t_acme";
const SCOPE = "scope://t_acme/env/prod/service/checkout";

// Helper to author one envelope per backend from a single neutral params object.
function envFor(connector: string, capability: string, params: Record<string, unknown>): CapabilityEnvelope {
  return {
    tenant_id: TENANT,
    capability,
    scope: SCOPE,
    params,
    routing: { connector },
    budget: { vendor_quota_class: "datadog.mcp", cost_attribution: "tsk_01J0000000000000000000000A" },
    freshness: { max_staleness_s: 300, served_from: "live" },
  };
}

// The 13 neutral investigation steps (capability + params), backend-agnostic.
export const INVESTIGATION: { name: string; capability: string; params: Record<string, unknown> }[] = [
  {
    name: "p99 checkout latency, last 5m",
    capability: "observability/1:query_metrics",
    params: {
      paramsVersion: 1,
      metric: "http_request_duration_seconds",
      aggregation: { percentile: 99 },
      filters: [{ key: "service", op: "eq", value: "checkout" }],
      time: { from: "now-5m", to: "now" },
    },
  },
  {
    name: "p99 latency grouped by endpoint",
    capability: "observability/1:query_metrics",
    params: {
      paramsVersion: 1,
      metric: "http_request_duration_seconds",
      aggregation: { percentile: 99 },
      filters: [{ key: "service", op: "eq", value: "checkout" }],
      group_by: ["endpoint"],
      time: { from: "now-15m", to: "now" },
    },
  },
  {
    name: "5xx error rate (ratio over total), last 5m",
    capability: "observability/1:query_metrics",
    params: {
      paramsVersion: 1,
      metric: "http_requests_total",
      aggregation: "rate",
      filters: [{ key: "status", op: "regex", value: "5.." }],
      ratio_over: { metric: "http_requests_total", filters: [] },
      time: { from: "now-5m", to: "now" },
    },
  },
  {
    name: "request throughput (rate), last 10m",
    capability: "observability/1:query_metrics",
    params: {
      paramsVersion: 1,
      metric: "http_requests_total",
      aggregation: "rate",
      filters: [{ key: "service", op: "eq", value: "checkout" }],
      time: { from: "now-10m", to: "now" },
    },
  },
  {
    name: "avg DB connection pool in use",
    capability: "observability/1:query_metrics",
    params: {
      paramsVersion: 1,
      metric: "db_pool_in_use",
      aggregation: "avg",
      filters: [{ key: "service", op: "eq", value: "checkout" }],
      time: { from: "now-30m", to: "now" },
    },
  },
  {
    name: "max heap usage by pod",
    capability: "observability/1:query_metrics",
    params: {
      paramsVersion: 1,
      metric: "jvm_memory_used_bytes",
      aggregation: "max",
      filters: [{ key: "service", op: "eq", value: "checkout" }],
      group_by: ["pod"],
      time: { from: "now-30m", to: "now" },
    },
  },
  {
    name: "logs: errors for a specific trace id",
    capability: "observability/1:search_logs",
    params: {
      paramsVersion: 1,
      filters: [
        { key: "service", op: "eq", value: "checkout" },
        { key: "status", op: "eq", value: "error" },
      ],
      contains: "4bf92f3577b34da6a3ce929d0e0e4736",
      time: { from: "now-15m", to: "now" },
      limit: 200,
    },
  },
  {
    name: "logs: timeout exceptions excluding healthcheck",
    capability: "observability/1:search_logs",
    params: {
      paramsVersion: 1,
      filters: [
        { key: "service", op: "eq", value: "checkout" },
        { key: "path", op: "neq", value: "/healthz" },
      ],
      contains: "TimeoutException",
      time: { from: "now-30m", to: "now" },
    },
  },
  {
    name: "logs: regex match on error code pattern",
    capability: "observability/1:search_logs",
    params: {
      paramsVersion: 1,
      filters: [
        { key: "service", op: "eq", value: "checkout" },
        { key: "error_code", op: "regex", value: "DB_(CONN|TIMEOUT)_.*" },
      ],
      time: { from: "now-30m", to: "now" },
    },
  },
  {
    name: "get distributed trace by id",
    capability: "observability/1:get_trace",
    params: {
      paramsVersion: 1,
      trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
      time: { from: "now-30m", to: "now" },
    },
  },
  {
    name: "list firing monitors for checkout",
    capability: "observability/1:list_monitors",
    params: {
      paramsVersion: 1,
      filters: [{ key: "service", op: "eq", value: "checkout" }],
      state: "alert",
    },
  },
  {
    name: "list all monitors for the team (no state filter)",
    capability: "observability/1:list_monitors",
    params: {
      paramsVersion: 1,
      filters: [{ key: "team", op: "eq", value: "payments" }],
      state: "all",
    },
  },
  {
    name: "annotate: deploy correlation marker",
    capability: "observability/1:write_annotation",
    params: {
      paramsVersion: 1,
      text: "Investigating checkout p99 spike; correlated to deploy v1487",
      at: "2026-06-16T10:05:00Z",
      tags: ["incident:inc_42", "deploy:v1487"],
      target: { service: "checkout" },
    },
  },
];

export function buildHub(): ConnectorHub {
  const hub = new ConnectorHub();
  hub.register(datadogAdapter);
  hub.register(grafanaAdapter);
  hub.register(newrelicAdapter);
  return hub;
}

export interface BackendScore {
  vendor: string;
  total: number;
  expressible: number;
  pct: number;
  remainder: { step: string; reason: string }[];
}

export function scoreBackend(connectorId: string): BackendScore {
  const hub = buildHub();
  const remainder: { step: string; reason: string }[] = [];
  let expressible = 0;
  for (const step of INVESTIGATION) {
    const env = envFor(connectorId, step.capability, step.params);
    const t = hub.translate(env);
    if (t.passthrough) {
      remainder.push({ step: step.name, reason: t.passthrough.reason });
    } else {
      expressible++;
    }
  }
  const vendor = hub.translate(envFor(connectorId, INVESTIGATION[0]!.capability, INVESTIGATION[0]!.params)).vendor;
  return {
    vendor,
    total: INVESTIGATION.length,
    expressible,
    pct: Math.round((expressible / INVESTIGATION.length) * 1000) / 10,
    remainder,
  };
}

// CLI: print the per-backend report.
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const con of ["con_datadog_1", "con_grafana_1", "con_newrelic_1"]) {
    const s = scoreBackend(con);
    console.log(`\n=== ${s.vendor} (${con}) ===`);
    console.log(`expressible: ${s.expressible}/${s.total} = ${s.pct}%`);
    for (const r of s.remainder) console.log(`  remainder: "${r.step}" -> ${r.reason}`);
  }
  // Show one translated query string per backend for the p99 step.
  const hub = buildHub();
  console.log("\n--- p99 latency translated per backend (same neutral envelope) ---");
  for (const con of ["con_datadog_1", "con_grafana_1", "con_newrelic_1"]) {
    const env = envFor(con, INVESTIGATION[0]!.capability, INVESTIGATION[0]!.params);
    console.log(`${con}: ${hub.translate(env).query}`);
  }
}
