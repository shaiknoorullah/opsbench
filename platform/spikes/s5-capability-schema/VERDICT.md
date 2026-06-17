# S5 Verdict — Cross-Vendor Capability Schema

- **Spike:** SPEC-OPSBENCH-001 Part 2 §1 S5 / Part 1 §8 (CapabilityEnvelope), PRD INT-001, INT-005, arch C10.
- **Date:** 2026-06-16
- **Status:** **PASS** (all three exit criteria met).
- **Headline:** One `observability/1` schema expresses **92.3% (12/13)** of a sampled real
  SRE investigation on **each** of Datadog, Grafana (Prometheus/Loki), and New Relic — above
  the 90% bar. The remainder is catalogued and routed through a policy-visible vendor-native
  escape hatch. Backend swap requires **zero** agent-facing change. Vendor-quota budgeting is
  demonstrated on the Datadog MCP quota.

All numbers below are produced by `npm test` (41 tests, all passing) and `npm run investigation`.

---

## Exit criterion 1 — expressibility >= 90% per backend + escape hatch — **PASS**

The sampled investigation (`src/investigation.ts`, 13 steps) models a checkout latency/error
incident: p99 latency (+ grouped), 5xx error-rate ratio, throughput, DB-pool, heap-by-pod,
log search for a trace id, timeout-exception search (with exclusion), regex log search,
get-trace-by-id, list firing monitors, list all monitors, deploy-correlation annotation.

| Backend | Connector | Expressible | % | Inexpressible remainder |
|---|---|---|---|---|
| Datadog | `con_datadog_1` | 12 / 13 | **92.3%** | regex log filter with PCRE alternation `DB_(CONN\|TIMEOUT)_.*` |
| Grafana (Prom/Loki) | `con_grafana_1` | 12 / 13 | **92.3%** | `list_monitors state=alert` (live alert state ≠ rule definition) |
| New Relic | `con_newrelic_1` | 12 / 13 | **92.3%** | `list_monitors state=alert` (state lives on issue/incident, not condition) |

Sample of the SAME neutral envelope translated three ways (p99 latency):

```
datadog : p99:http_request_duration_seconds{service:checkout}
grafana : histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service="checkout"}[5m])) by (le))
newrelic: SELECT percentile(http_request_duration_seconds, 99) FROM Transaction WHERE service = 'checkout' SINCE 5 minutes ago
```

### Translation correctness — validated against documented vendor syntax

Every translation was checked against vendor docs (fetched 2026-06-16) and asserted as an
exact string in the per-backend translation tests:

- **PromQL** `histogram_quantile(0.99, sum(rate(<m>_bucket{...}[5m])) by (le))`; ratio
  `sum(rate(...{status=~"5.."}[5m])) / sum(rate(...[5m]))`; matchers `= != =~ !~` —
  <https://prometheus.io/docs/prometheus/latest/querying/functions/>
- **LogQL** `{app="checkout",env!="dev"} |~ \`regex\` |= \`needle\`` — line filter ops `|= != |~ !~` —
  <https://grafana.com/docs/loki/latest/query/log_queries/>
- **Datadog metrics** `[agg]:[metric]{tag:value,...} by {group}`, `p99:` percentile prefix —
  <https://docs.datadoghq.com/metrics/advanced-filtering/>; metric tag filtering supports
  **wildcards (`*`,`?`) but not PCRE** — <https://www.datadoghq.com/blog/wildcard-filter-queries/>
- **Datadog Logs** reserved attrs (`service:`,`status:`,`trace_id:`) no `@`; custom attrs `@k:v`;
  AND/OR/`-` exclusion — <https://docs.datadoghq.com/logs/explorer/search_syntax/>
- **NRQL** `SELECT percentile(duration, 99) FROM Transaction WHERE appName = 'x' SINCE 5 minutes ago`;
  error-rate `percentage(count(*), WHERE error = true)`; `FROM Log ... message LIKE '%x%'`;
  `FACET`/`TIMESERIES`; `RLIKE` for regex —
  <https://docs.newrelic.com/docs/nrql/get-started/introduction-nrql-new-relics-query-language/>

### Escape-hatch design (vendor-native passthrough, policy-visible)

When a neutral param cannot be faithfully expressed, the adapter sets a structured marker on
the **`TranslatedRequest.passthrough`** field rather than silently degrading or failing:

```ts
passthrough: { reason: string; raw: string } | null
```

Properties of the design:

- **Policy-visible by construction.** The marker rides on the translated request the router
  returns, so the gatekeeper (S1 Cedar layer) sees both that a passthrough occurred and the
  raw vendor-native fragment, and can `permit`/`deny` it as a distinct, higher-risk action
  (`connector:<vendor>:passthrough`). It is never hidden inside an opaque query string.
- **Graceful where lossless.** Wildcard-equivalent regex (`.` → `?`, `.*` → `*`) is translated
  faithfully to Datadog wildcards and is NOT counted as a remainder (verified: the `5..`
  error-rate filter translates to `5??` losslessly). Only true PCRE features (alternation,
  char-classes, anchors, counted quantifiers, groups) escape-hatch.
- **Auditable.** `reason` is human-readable; `raw` is the verbatim fragment for the SIEM stream.

The two documented remainder classes:

1. **PCRE on Datadog** (metrics tag selector + Logs search are wildcard, not PCRE). Escape hatch:
   carry the raw PCRE as a vendor-native log-pattern passthrough, policy-gated.
2. **Live monitor/alert STATE** (`list_monitors state=alert`). On Grafana the Provisioning API
   returns rule *definitions*, not live state (state is in Alertmanager); on New Relic state is on
   the issue/incident entity, not the condition. Escape hatch: the adapter flags that the state
   filter is resolved by a secondary native call (`/api/alertmanager`, `NrAiIncident`), which the
   policy layer authorizes explicitly. (Datadog *does* express monitor state via `group_states`,
   hence Datadog's remainder is the regex case, not monitors.)

---

## Exit criterion 2 — backend swap requires ZERO agent-prompt change — **PASS**

Proven by `test/swap.test.ts`:

- The agent-facing payload (`tenant_id`, `capability`, `scope`, `params`) is authored once with
  **no query language and no vendor concept**. The platform attaches `routing.connector`.
- The test asserts the agent-facing fields are **byte-identical** across two backends
  (`assert.deepEqual(restA, restB)`) and that **only `routing` differs**.
- The single envelope routes to all three connectors and yields three correct, distinct native
  queries (`datadog_metrics` / `promql` / `nrql`). Mid-investigation swap mutates only
  `routing.connector`; the `params` object reference is never touched by the hub.
- Fallback routing (`routing.fallback`) is honored when the primary connector is unregistered.

This satisfies the INT-001 acceptance bar ("adding a vendor adds an adapter, never an
agent-visible schema change") and the MVP exit "second observability backend swap requires zero
agent-prompt changes".

---

## Exit criterion 3 — vendor-quota budget accounting — **PASS**

Demonstrated on Datadog (`src/budget.ts`, `test/budget.test.ts`) using the **documented** MCP
quota from the integrations catalog (research §2): **50 requests / 10 s burst AND 50,000 tool
calls / month**, dual sliding windows.

- Each routed call charges `envelope.budget.vendor_quota_class` and attributes spend to
  `envelope.budget.cost_attribution` (a `tsk_…` id) — a per-task ledger usable for the
  cross-vendor spend dashboard the research calls a differentiator.
- **Pre-exhaustion alert** fires at <=20% remaining on the tightest window (test charges 41/50
  on the 10 s window and asserts a `warn`).
- **Hard rejection at exhaustion**: the 51st call within 10 s is rejected, the vendor query is
  **not issued** (`translated.query === ""`, `passthrough.reason = "budget exhausted…"`), and a
  structured `exhausted` alert is recorded — so policy/surfaces see it rather than a silent drop.
- Sliding-window recovery verified (capacity frees after the window elapses); the monthly window
  is tracked independently of the burst window.

Budgeting is connector-agnostic (lives in the hub, keyed by `vendor_quota_class`); a Grafana or
New Relic quota class registers the same way. Dynatrace's GB-scanned model
(`DT_GRAIL_QUERY_BUDGET_GB`) maps onto the same `QuotaClassConfig` with a byte-cost charge
instead of a unit charge — noted for the fast-follow connector.

---

## Suggested spec amendments

1. **Promote `observability/1` verb-param schemas into `packages/schemas`.** This spike defines
   them in `src/observability-v1.schema.json` (JSON Schema 2020-12, the same dialect/style as the
   committed schemas). Proposed: add `json/observability-v1.json` and validate
   `CapabilityEnvelope.params` against the `$def` selected by the verb segment of `capability`.
   The neutral param shapes worth promoting verbatim:
   - `query_metrics`: `{ metric, aggregation (avg|sum|min|max|count|rate|{percentile}), filters[], group_by[], time{from,to}, ratio_over? }`
   - `search_logs`: `{ filters[], contains?, time, limit? }`
   - `get_trace`: `{ trace_id, time? }`
   - `list_monitors`: `{ filters[], state? }`
   - `write_annotation`: `{ text, at?, tags[], target{service?,dashboard?} }`
   - shared `filter` op set `eq|neq|regex|not_regex` (chosen as the **intersection that all four
     query languages express**, with PCRE-beyond-wildcard as the documented Datadog exception).

2. **Add a normative `paramsVersion` to verb params** (`const` per domain version). The envelope
   already versions the domain (`observability/1`); pinning `paramsVersion: 1` inside `params`
   prevents a v1 envelope being silently reinterpreted under v2 semantics during a concurrent
   two-version rollout. Tested in `envelope.test.ts`.

3. **Make the escape hatch a first-class, schema-visible field.** Recommend adding an optional
   `passthrough` block to the connector *response* contract (not the agent-facing envelope) so the
   gatekeeper can gate vendor-native passthrough as its own action verb
   (`connector:<vendor>:passthrough`) with a higher approval tier. The agent-facing envelope stays
   neutral; only the platform-internal translated request carries the marker.

4. **Model live-state vs. definition reads distinctly.** `list_monitors` conflates "what alert
   rules exist" with "what is firing now". Recommend splitting into `list_monitors` (definitions)
   and `get_alert_state` (live), since the backends split them at the API level. This would lift
   all three backends to ~100% on the sampled set.

5. **Budget block: record the charged windows in the AuditRecord.** Recommend the `budget` charge
   result (per-window remaining + alert level) be emitted on the `tool_call` AuditRecord so spend
   and throttling are independently verifiable offline (consistent with NF-003).

---

## Blocked / not executed (environment reality)

- **Live vendor calls** (Datadog `/api/v1/query`, Grafana datasource proxy, New Relic NerdGraph):
  **documented, not executed** — no credentials in this environment. Each adapter emits the exact
  `endpoint{method,path}` + request body it WOULD send; correctness is proven by generated-query
  assertions against documented syntax and by parsing recorded fixtures (`fixtures/*.json`). A
  follow-up with sandbox keys should replay the 13-step investigation live and diff against these
  fixtures.
- **NRQL dimensional `FROM Metric` mapping** is heuristic (dotted metric name → `FROM Metric`),
  flagged via the escape hatch. A production New Relic connector should resolve metric→event-type
  from the account's data dictionary rather than by name shape.
- **Datadog Logs PCRE**: confirmed wildcard-only from docs; whether a given customer's pipeline
  supports `@attr:/regex/` grok-pattern search is account-dependent and should be probed at
  connector-onboarding time.
