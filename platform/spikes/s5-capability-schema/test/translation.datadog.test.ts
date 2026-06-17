// Datadog translation tests: assert neutral params -> EXACT Datadog query strings
// matching documented syntax.
//   metrics: https://docs.datadoghq.com/metrics/advanced-filtering/
//   logs:    https://docs.datadoghq.com/logs/explorer/search_syntax/
//   wildcard:https://www.datadoghq.com/blog/wildcard-filter-queries/
import { test } from "node:test";
import assert from "node:assert/strict";
import { datadogAdapter } from "../src/adapters/datadog.ts";
import type { CapabilityEnvelope } from "../src/envelope.ts";

const env = (capability: string, params: Record<string, unknown>): CapabilityEnvelope => ({
  tenant_id: "t_acme",
  capability,
  scope: "scope://t_acme/env/prod",
  params,
  routing: { connector: "con_datadog_1" },
});

test("datadog: p99 latency uses p99: prefix + {tag:value} selector", () => {
  const t = datadogAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "trace.http.request.duration",
      aggregation: { percentile: 99 },
      filters: [{ key: "service", op: "eq", value: "checkout" }],
      time: { from: "now-5m", to: "now" },
    } as any,
    env("observability/1:query_metrics", {}),
  );
  assert.equal(t.query, "p99:trace.http.request.duration{service:checkout}");
  assert.equal(t.language, "datadog_metrics");
  assert.equal(t.passthrough, null);
});

test("datadog: group_by renders ' by {tag}'", () => {
  const t = datadogAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "system.cpu.user",
      aggregation: "avg",
      filters: [{ key: "env", op: "eq", value: "prod" }],
      group_by: ["availability-zone"],
      time: { from: "now-5m", to: "now" },
    } as any,
    env("observability/1:query_metrics", {}),
  );
  assert.equal(t.query, "avg:system.cpu.user{env:prod} by {availability-zone}");
});

test("datadog: wildcard-equivalent regex 5.. -> wildcard 5?? (lossless, no passthrough)", () => {
  const t = datadogAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "http.requests",
      aggregation: "rate",
      filters: [{ key: "http.status_code", op: "regex", value: "5.." }],
      ratio_over: { metric: "http.requests", filters: [] },
      time: { from: "now-5m", to: "now" },
    } as any,
    env("observability/1:query_metrics", {}),
  );
  assert.match(t.query, /http\.status_code:5\?\?/);
  assert.match(t.query, /\.as_rate\(\)/);
  assert.match(t.query, /^\(.*\/.*\)$/); // ratio wrapped in parens
  assert.equal(t.passthrough, null, "wildcard-equivalent regex must be lossless");
});

test("datadog: PCRE-only regex (alternation) escape-hatches with policy-visible passthrough", () => {
  const t = datadogAdapter.translate(
    "search_logs",
    {
      paramsVersion: 1,
      filters: [{ key: "error_code", op: "regex", value: "DB_(CONN|TIMEOUT)_.*" }],
      time: { from: "now-30m", to: "now" },
    } as any,
    env("observability/1:search_logs", {}),
  );
  assert.ok(t.passthrough, "PCRE alternation must trigger the escape hatch");
  assert.match(t.passthrough!.reason, /PCRE/);
});

test("datadog logs: reserved attrs take no @ prefix; custom attrs take @", () => {
  const t = datadogAdapter.translate(
    "search_logs",
    {
      paramsVersion: 1,
      filters: [
        { key: "service", op: "eq", value: "checkout" },
        { key: "status", op: "eq", value: "error" },
        { key: "region", op: "eq", value: "us-east-1" },
      ],
      contains: "4bf92f3577b34da6a3ce929d0e0e4736",
      time: { from: "now-15m", to: "now" },
    } as any,
    env("observability/1:search_logs", {}),
  );
  // reserved: service:, status:  (no @) ; custom: @region:
  assert.match(t.query, /\bservice:checkout\b/);
  assert.match(t.query, /\bstatus:error\b/);
  assert.match(t.query, /@region:us-east-1/);
  assert.match(t.query, /4bf92f3577b34da6a3ce929d0e0e4736/); // free text
  assert.equal(t.endpoint.path, "/api/v2/logs/events/search");
});

test("datadog: neq filter renders ! exclusion", () => {
  const t = datadogAdapter.translate(
    "query_metrics",
    {
      paramsVersion: 1,
      metric: "m",
      aggregation: "sum",
      filters: [{ key: "path", op: "neq", value: "healthz" }],
      time: { from: "now-5m", to: "now" },
    } as any,
    env("observability/1:query_metrics", {}),
  );
  assert.match(t.query, /\{!path:healthz\}/);
});

test("datadog: write_annotation -> Events v2 POST", () => {
  const t = datadogAdapter.translate(
    "write_annotation",
    { paramsVersion: 1, text: "deploy v1487", target: { service: "checkout" }, tags: ["incident:inc_42"] } as any,
    env("observability/1:write_annotation", {}),
  );
  assert.equal(t.endpoint.method, "POST");
  assert.equal(t.endpoint.path, "/api/v1/events");
  assert.deepEqual((t.request as any).tags, ["incident:inc_42", "service:checkout"]);
});
