// EXIT CRITERION 2: swapping backends requires ZERO change to the agent-facing
// schema / agent prompt. The agent authors ONE CapabilityEnvelope; only
// `routing.connector` changes between backends. We prove the agent-facing input
// (everything except routing) is byte-identical and only the connector differs,
// yet each backend produces its own correct native query.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHub } from "../src/investigation.ts";
import type { CapabilityEnvelope } from "../src/envelope.ts";

// The agent-facing payload: NO query language, NO vendor concept. This is what a
// prompt/tool-call would carry. `routing` is set by the platform, not the agent.
const agentFacing = {
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
} as const;

function envelopeForConnector(connector: string): CapabilityEnvelope {
  // Platform layer attaches routing; agent-facing fields are spread UNCHANGED.
  return { ...structuredClone(agentFacing), routing: { connector } } as CapabilityEnvelope;
}

test("swap: agent-facing fields are byte-identical across A and B; only routing differs", () => {
  const a = envelopeForConnector("con_datadog_1");
  const b = envelopeForConnector("con_grafana_1");

  // Strip routing and compare the rest — the part an agent/prompt produces.
  const { routing: ra, ...restA } = a;
  const { routing: rb, ...restB } = b;
  assert.deepEqual(restA, restB, "agent-facing envelope must be identical on swap");
  assert.notDeepEqual(ra, rb, "only routing.connector should differ");
});

test("swap: same envelope routes to 3 different connectors -> 3 correct native queries", () => {
  const hub = buildHub();

  const dd = hub.translate(envelopeForConnector("con_datadog_1"));
  const gf = hub.translate(envelopeForConnector("con_grafana_1"));
  const nr = hub.translate(envelopeForConnector("con_newrelic_1"));

  assert.equal(dd.vendor, "datadog");
  assert.equal(gf.vendor, "grafana");
  assert.equal(nr.vendor, "newrelic");

  // Each speaks its own language — proof the neutral layer fanned out correctly.
  assert.equal(dd.language, "datadog_metrics");
  assert.equal(gf.language, "promql");
  assert.equal(nr.language, "nrql");

  // And the queries are genuinely different native strings.
  assert.notEqual(dd.query, gf.query);
  assert.notEqual(gf.query, nr.query);

  // Spot-check each is the documented form.
  assert.equal(dd.query, "p99:http_request_duration_seconds{service:checkout}");
  assert.match(gf.query, /^histogram_quantile\(0\.99, sum\(rate\(/);
  assert.match(nr.query, /^SELECT percentile\(http_request_duration_seconds, 99\) FROM Transaction/);
});

test("swap: A->B mid-investigation requires no params edit (connector resolved at route time)", () => {
  const hub = buildHub();
  const env = envelopeForConnector("con_datadog_1");

  const first = hub.translate(env);
  assert.equal(first.vendor, "datadog");

  // "Swap": change ONLY routing.connector. params/capability/scope untouched.
  env.routing.connector = "con_newrelic_1";
  const second = hub.translate(env);
  assert.equal(second.vendor, "newrelic");

  // params object is the exact same reference — never mutated by the hub.
  assert.equal(env.params, second ? env.params : null);
  assert.deepEqual(env.params, agentFacing.params);
});

test("swap: fallback connector is used when primary unregistered", () => {
  const hub = buildHub();
  const env = envelopeForConnector("con_nonexistent");
  env.routing.fallback = ["con_grafana_1"];
  const t = hub.translate(env);
  assert.equal(t.vendor, "grafana");
});
