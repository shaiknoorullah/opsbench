// EXIT CRITERION 3: vendor-quota budget accounting on at least one backend.
// Demonstrated on the Datadog MCP quota (documented: 50 req/10s AND 50k/month,
// research §2), with attribution and a pre-exhaustion alert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BudgetLedger, datadogMcpQuota } from "../src/budget.ts";
import { ConnectorHub } from "../src/router.ts";
import { datadogAdapter } from "../src/adapters/datadog.ts";
import type { CapabilityEnvelope } from "../src/envelope.ts";

function ddEnv(): CapabilityEnvelope {
  return {
    tenant_id: "t_acme",
    capability: "observability/1:query_metrics",
    scope: "scope://t_acme/env/prod",
    params: {
      paramsVersion: 1,
      metric: "m",
      aggregation: "avg",
      filters: [],
      time: { from: "now-5m", to: "now" },
    },
    routing: { connector: "con_datadog_1" },
    budget: { vendor_quota_class: "datadog.mcp", cost_attribution: "tsk_01J0000000000000000000000A" },
  };
}

test("budget: decrements the named quota class and attributes to the task", () => {
  const ledger = new BudgetLedger();
  ledger.registerClass(datadogMcpQuota());
  const hub = new ConnectorHub(ledger);
  hub.register(datadogAdapter);

  const now = Date.now();
  const r1 = ledger.charge("datadog.mcp", "tsk_A", now);
  assert.equal(r1.allowed, true);
  const tight = r1.remaining.find((w) => w.windowMs === 10_000)!;
  assert.equal(tight.remaining, 49);

  assert.deepEqual(ledger.attribution.get("tsk_A"), { "datadog.mcp": 1 });
});

test("budget: pre-exhaustion alert fires at <=20% remaining on the 10s window", () => {
  const ledger = new BudgetLedger();
  ledger.registerClass(datadogMcpQuota()); // 50/10s, alert at 20% remaining (<=10 left)
  const now = Date.now();

  let lastWarn: string | null = null;
  for (let i = 0; i < 41; i++) {
    const r = ledger.charge("datadog.mcp", "tsk_A", now);
    assert.equal(r.allowed, true);
    if (r.alert.level === "warn") lastWarn = r.alert.message;
  }
  // After 41 charges, 9 remain on the 10s/50 window -> warn must have fired.
  assert.ok(lastWarn, "pre-exhaustion warn should have fired");
  assert.match(lastWarn!, /datadog\.mcp/);
  assert.ok(ledger.alerts.some((a) => a.level === "warn"));
});

test("budget: hard rejection when 10s window is full; vendor call NOT issued", () => {
  const ledger = new BudgetLedger();
  ledger.registerClass(datadogMcpQuota());
  const hub = new ConnectorHub(ledger);
  hub.register(datadogAdapter);
  const now = Date.now();

  // Saturate the 50/10s window directly.
  for (let i = 0; i < 50; i++) ledger.charge("datadog.mcp", "tsk_A", now);

  // The 51st via the hub must be rejected and not produce a real query.
  const outcome = hub.route(ddEnv(), undefined);
  assert.equal(outcome.budget?.allowed, false);
  assert.equal(outcome.budget?.alert.level, "exhausted");
  assert.equal(outcome.translated.query, "", "no vendor query issued on exhaustion");
  assert.match(outcome.translated.passthrough!.reason, /budget exhausted/);
});

test("budget: sliding window frees capacity after the window elapses", () => {
  const ledger = new BudgetLedger();
  ledger.registerClass(datadogMcpQuota());
  const t0 = 1_000_000;
  for (let i = 0; i < 50; i++) ledger.charge("datadog.mcp", "tsk_A", t0);
  // Full now.
  assert.equal(ledger.charge("datadog.mcp", "tsk_A", t0).allowed, false);
  // 11s later the 10s window has drained.
  const later = t0 + 11_000;
  assert.equal(ledger.charge("datadog.mcp", "tsk_A", later).allowed, true);
});

test("budget: monthly window also tracked independently of burst window", () => {
  const ledger = new BudgetLedger();
  ledger.registerClass(datadogMcpQuota());
  const r = ledger.charge("datadog.mcp", "tsk_A");
  const monthly = r.remaining.find((w) => w.windowMs > 1_000_000_000)!;
  assert.equal(monthly.limit, 50_000);
  assert.equal(monthly.remaining, 49_999);
});
