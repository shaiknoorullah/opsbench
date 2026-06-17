// Envelope validation: consumes the REAL CapabilityEnvelope schema from
// packages/schemas (spec 01 §8) AND validates observability/1 verb params.
// Also exercises fixture parsing -> NormalizedResult per backend.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateEnvelope } from "../src/envelope.ts";
import type { CapabilityEnvelope } from "../src/envelope.ts";
import { buildHub } from "../src/investigation.ts";

const fx = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8"));

const good: CapabilityEnvelope = {
  tenant_id: "t_acme",
  capability: "observability/1:query_metrics",
  scope: "scope://t_acme/env/prod/service/checkout",
  params: {
    paramsVersion: 1,
    metric: "http_request_duration_seconds",
    aggregation: { percentile: 99 },
    filters: [{ key: "service", op: "eq", value: "checkout" }],
    time: { from: "now-5m", to: "now" },
  },
  routing: { connector: "con_datadog_1", fallback: ["con_grafana_1"] },
  budget: { vendor_quota_class: "datadog.mcp", cost_attribution: "tsk_01J0000000000000000000000A" },
  freshness: { max_staleness_s: 300, served_from: "live" },
};

test("valid observability/1 envelope passes both envelope + verb-param validation", () => {
  const r = validateEnvelope(good);
  assert.ok(r.ok, r.errors.join("; "));
});

test("rejects bad capability pattern (real envelope schema enforces domain/version:verb)", () => {
  const bad = { ...good, capability: "observability:query_metrics" };
  const r = validateEnvelope(bad as CapabilityEnvelope);
  assert.equal(r.ok, false);
});

test("rejects unknown verb param field (additionalProperties:false on observability/1)", () => {
  const bad = { ...good, params: { ...good.params, bogus: 1 } };
  const r = validateEnvelope(bad as CapabilityEnvelope);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith("params")));
});

test("rejects wrong paramsVersion (const:1 guards against silent v2 reinterpretation)", () => {
  const bad = { ...good, params: { ...good.params, paramsVersion: 2 } };
  const r = validateEnvelope(bad as CapabilityEnvelope);
  assert.equal(r.ok, false);
});

test("rejects capability with unsupported domain version", () => {
  const bad = { ...good, capability: "observability/2:query_metrics" };
  const r = validateEnvelope(bad as CapabilityEnvelope);
  assert.equal(r.ok, false);
});

test("fixtures parse into NormalizedResult with as_of (freshness envelope honored)", () => {
  const hub = buildHub();
  const cases = [
    ["con_datadog_1", "datadog.query.json"],
    ["con_grafana_1", "grafana.query.json"],
    ["con_newrelic_1", "newrelic.query.json"],
  ] as const;
  for (const [con, file] of cases) {
    const outcome = hub.route({ ...good, routing: { connector: con } }, fx(file));
    assert.ok(outcome.result, `${con} should parse a result`);
    assert.equal(outcome.result!.as_of, "2026-06-16T10:05:03Z");
    assert.ok(outcome.result!.data, `${con} normalized data present`);
  }
});
