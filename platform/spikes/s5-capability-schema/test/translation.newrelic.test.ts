// New Relic translation tests: neutral params -> EXACT NRQL strings.
//   NRQL: https://docs.newrelic.com/docs/nrql/get-started/introduction-nrql-new-relics-query-language/
import { test } from "node:test";
import assert from "node:assert/strict";
import { newrelicAdapter } from "../src/adapters/newrelic.ts";
import type { CapabilityEnvelope } from "../src/envelope.ts";

const env = (capability: string): CapabilityEnvelope => ({
  tenant_id: "t_acme",
  capability,
  scope: "scope://t_acme/env/prod",
  params: {},
  routing: { connector: "con_newrelic_1" },
});

test("nrql: p99 -> SELECT percentile(attr, 99) FROM Transaction WHERE ... SINCE N minutes ago", () => {
  const t = newrelicAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "duration",
      aggregation: { percentile: 99 },
      filters: [{ key: "appName", op: "eq", value: "checkout" }],
      time: { from: "now-5m", to: "now" },
    } as any,
    env("observability/1:query_metrics"),
  );
  assert.equal(
    t.query,
    "SELECT percentile(duration, 99) FROM Transaction WHERE appName = 'checkout' SINCE 5 minutes ago",
  );
  assert.equal(t.language, "nrql");
});

test("nrql: error-rate uses percentage(count(*), WHERE ...)", () => {
  const t = newrelicAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "duration",
      aggregation: "count",
      filters: [{ key: "error", op: "eq", value: "true" }],
      ratio_over: { metric: "duration", filters: [] },
      time: { from: "now-5m", to: "now" },
    } as any,
    env("observability/1:query_metrics"),
  );
  assert.match(t.query, /SELECT percentage\(count\(\*\), WHERE error = 'true'\) FROM Transaction/);
});

test("nrql: FACET from group_by; regex op -> RLIKE", () => {
  const t = newrelicAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "duration",
      aggregation: "max",
      filters: [{ key: "host", op: "regex", value: "web-.*" }],
      group_by: ["host"],
      time: { from: "now-30m", to: "now" },
    } as any,
    env("observability/1:query_metrics"),
  );
  assert.match(t.query, /WHERE host RLIKE 'web-\.\*'/);
  assert.match(t.query, /FACET host/);
});

test("nrql logs: FROM Log WHERE message LIKE '%needle%'", () => {
  const t = newrelicAdapter.translate(
    "search_logs",
    {
      paramsVersion: 1,
      filters: [{ key: "service", op: "eq", value: "checkout" }],
      contains: "TimeoutException",
      time: { from: "now-15m", to: "now" },
      limit: 200,
    } as any,
    env("observability/1:search_logs"),
  );
  assert.match(t.query, /FROM Log WHERE service = 'checkout' AND message LIKE '%TimeoutException%'/);
  assert.match(t.query, /LIMIT 200/);
});

test("nrql get_trace -> FROM Span WHERE trace.id = '<id>'", () => {
  const t = newrelicAdapter.translate(
    "get_trace",
    { paramsVersion: 1, trace_id: "4bf92f35", time: { from: "now-30m", to: "now" } } as any,
    env("observability/1:get_trace"),
  );
  assert.match(t.query, /FROM Span WHERE trace\.id = '4bf92f35'/);
});

test("nrql: dimensional metric (dotted) -> FROM Metric + escape-hatch flag", () => {
  const t = newrelicAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "system.cpu.user",
      aggregation: "avg",
      filters: [],
      time: { from: "now-5m", to: "now" },
    } as any,
    env("observability/1:query_metrics"),
  );
  assert.match(t.query, /FROM Metric/);
  assert.ok(t.passthrough, "dimensional Metric mapping is heuristic -> flagged");
});

test("nrql: write_annotation -> changeTracking NerdGraph mutation", () => {
  const t = newrelicAdapter.translate(
    "write_annotation",
    { paramsVersion: 1, text: "deploy v1487", target: { service: "GUID123" } } as any,
    env("observability/1:write_annotation"),
  );
  assert.match(t.query, /changeTrackingCreateDeployment/);
  assert.equal(t.endpoint.path, "/graphql");
});
