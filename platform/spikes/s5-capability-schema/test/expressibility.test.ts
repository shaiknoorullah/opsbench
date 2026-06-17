// EXIT CRITERION 1: >= 90% of the sampled investigation expressible per backend;
// the remainder catalogued + routed through the policy-visible escape hatch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { INVESTIGATION, scoreBackend, buildHub } from "../src/investigation.ts";
import type { CapabilityEnvelope } from "../src/envelope.ts";

test("investigation has >=10 representative steps", () => {
  assert.ok(INVESTIGATION.length >= 10, `only ${INVESTIGATION.length} steps`);
});

for (const con of ["con_datadog_1", "con_grafana_1", "con_newrelic_1"]) {
  test(`expressibility >= 90% on ${con}`, () => {
    const s = scoreBackend(con);
    assert.ok(s.pct >= 90, `${s.vendor} expressibility ${s.pct}% < 90% (remainder: ${JSON.stringify(s.remainder)})`);
  });
}

test("every inexpressible step carries a policy-visible passthrough (reason + raw)", () => {
  const hub = buildHub();
  for (const con of ["con_datadog_1", "con_grafana_1", "con_newrelic_1"]) {
    for (const step of INVESTIGATION) {
      const env: CapabilityEnvelope = {
        tenant_id: "t_acme",
        capability: step.capability,
        scope: "scope://t_acme/env/prod",
        params: step.params,
        routing: { connector: con },
      };
      const t = hub.translate(env);
      if (t.passthrough) {
        assert.ok(t.passthrough.reason.length > 0, "passthrough must explain why");
        assert.ok(typeof t.passthrough.raw === "string", "passthrough must carry the raw native fragment");
      }
    }
  }
});

test("escape hatch is observable to a policy layer (passthrough is on the translated request, not hidden)", () => {
  // The PCRE-alternation log query on Datadog is our canonical escape-hatch case.
  const hub = buildHub();
  const env: CapabilityEnvelope = {
    tenant_id: "t_acme",
    capability: "observability/1:search_logs",
    scope: "scope://t_acme/env/prod",
    params: {
      paramsVersion: 1,
      filters: [{ key: "error_code", op: "regex", value: "DB_(CONN|TIMEOUT)_.*" }],
      time: { from: "now-30m", to: "now" },
    },
    routing: { connector: "con_datadog_1" },
  };
  const t = hub.translate(env);
  assert.ok(t.passthrough, "must escape-hatch");
  // A policy engine can read translated.passthrough and decide to permit/deny.
  assert.match(t.passthrough!.reason, /PCRE|passthrough|wildcard/i);
});
