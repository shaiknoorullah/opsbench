// Grafana translation tests: neutral params -> EXACT PromQL / LogQL strings.
//   PromQL: https://prometheus.io/docs/prometheus/latest/querying/functions/
//   LogQL:  https://grafana.com/docs/loki/latest/query/log_queries/
import { test } from "node:test";
import assert from "node:assert/strict";
import { grafanaAdapter } from "../src/adapters/grafana.ts";
import type { CapabilityEnvelope } from "../src/envelope.ts";

const env = (capability: string): CapabilityEnvelope => ({
  tenant_id: "t_acme",
  capability,
  scope: "scope://t_acme/env/prod",
  params: {},
  routing: { connector: "con_grafana_1" },
});

test("grafana: p99 -> histogram_quantile(0.99, sum(rate(<m>_bucket{...}[5m])) by (le))", () => {
  const t = grafanaAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "http_request_duration_seconds",
      aggregation: { percentile: 99 },
      filters: [{ key: "service", op: "eq", value: "checkout" }],
      time: { from: "now-5m", to: "now" },
    } as any,
    env("observability/1:query_metrics"),
  );
  assert.equal(
    t.query,
    'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service="checkout"}[5m])) by (le))',
  );
  assert.equal(t.language, "promql");
});

test("grafana: error-rate ratio -> sum(rate(5xx)) / sum(rate(total)) with =~ regex matcher", () => {
  const t = grafanaAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "http_requests_total",
      aggregation: "rate",
      filters: [{ key: "status", op: "regex", value: "5.." }],
      ratio_over: { metric: "http_requests_total", filters: [] },
      time: { from: "now-5m", to: "now" },
    } as any,
    env("observability/1:query_metrics"),
  );
  assert.equal(
    t.query,
    'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total{}[5m]))',
  );
  assert.equal(t.passthrough, null, "PromQL expresses regex + ratio natively");
});

test("grafana: window derives from relative range (now-15m -> [15m])", () => {
  const t = grafanaAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "http_requests_total",
      aggregation: "rate",
      filters: [],
      time: { from: "now-15m", to: "now" },
    } as any,
    env("observability/1:query_metrics"),
  );
  assert.match(t.query, /\[15m\]/);
});

test("grafana: group_by -> by (k) and preserves le for percentile", () => {
  const t = grafanaAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "http_request_duration_seconds",
      aggregation: { percentile: 95 },
      filters: [],
      group_by: ["endpoint"],
      time: { from: "now-5m", to: "now" },
    } as any,
    env("observability/1:query_metrics"),
  );
  assert.match(t.query, /histogram_quantile\(0\.95,/);
  assert.match(t.query, /by \(le,endpoint\)/);
});

test("grafana logs: stream selector + line filters (|= , !=) with backtick literals", () => {
  const t = grafanaAdapter.translate(
    "search_logs",
    {
      paramsVersion: 1,
      filters: [
        { key: "app", op: "eq", value: "checkout" },
        { key: "env", op: "neq", value: "dev" },
        { key: "msg", op: "regex", value: "DB_.*" },
      ],
      contains: "TimeoutException",
      time: { from: "now-30m", to: "now" },
    } as any,
    env("observability/1:search_logs"),
  );
  // eq/neq become stream-selector matchers; regex becomes a |~ line filter; contains -> |=
  assert.match(t.query, /\{app="checkout",env!="dev"\}/);
  assert.match(t.query, /\|~ `DB_\.\*`/);
  assert.match(t.query, /\|= `TimeoutException`/);
  assert.equal(t.language, "logql");
});

test("grafana: write_annotation -> POST /api/annotations", () => {
  const t = grafanaAdapter.translate(
    "write_annotation",
    { paramsVersion: 1, text: "deploy", target: { service: "checkout", dashboard: "abc" } } as any,
    env("observability/1:write_annotation"),
  );
  assert.equal(t.endpoint.path, "/api/annotations");
  assert.equal((t.request as any).dashboardUID, "abc");
});
