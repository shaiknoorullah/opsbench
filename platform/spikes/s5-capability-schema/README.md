# Spike S5 — Cross-Vendor Capability Schema

Standalone, throwaway prototype for **SPEC-OPSBENCH-001 Part 1 §8 (CapabilityEnvelope) / Part 2 §1 S5**, PRD INT-001 / INT-005, architecture C10.

**Question.** Can ONE observability capability schema (`observability/1`) express real
investigation queries across THREE backends — Datadog, Grafana (Prometheus/Loki), and
New Relic — without lowest-common-denominator loss?

**Answer (see [VERDICT.md](./VERDICT.md)).** Yes. 92.3% of a 13-step sampled SRE
investigation is expressible per backend (above the 90% bar); the small remainder is
catalogued and routed through a policy-visible vendor-native escape hatch. Swapping
backends requires zero change to the agent-facing envelope. Vendor-quota budgeting is
demonstrated on the Datadog MCP quota class.

## What this proves

1. **Translation** (the core deliverable): vendor-neutral `observability/1` params are
   translated into each backend's documented native query language —
   Datadog metric syntax + Logs Search API, PromQL + LogQL, and NRQL. Translation is a
   pure function (`adapter.translate`) asserted against the **documented** query formats
   (citations in `VERDICT.md` and inline in each adapter).
2. **Routing / swap**: the same `CapabilityEnvelope` (consumed from the real
   `packages/schemas`) routes to a different connector with no agent-facing change.
3. **Budget accounting**: the `envelope.budget` block decrements a modelled vendor quota
   class with per-task attribution and a pre-exhaustion alert.

No live vendor calls are made (no credentials in this environment). Adapters are driven by
recorded fixtures and generated-query assertions. Live-call validation is **documented,
not executed** — see `VERDICT.md` §"Blocked / not executed".

## Layout

```
src/
  verbs.ts                    observability/1 verb set + vendor-neutral param types (versioned)
  observability-v1.schema.json JSON Schema 2020-12 for the verb params (promotion candidate)
  envelope.ts                 imports the REAL CapabilityEnvelope from packages/schemas + validator
  connector.ts                ConnectorAdapter contract + TranslatedRequest (carries escape-hatch marker)
  budget.ts                   vendor-quota ledger (Datadog MCP 50/10s + 50k/mo), attribution, alerts
  router.ts                   ConnectorHub: validate -> charge budget -> dispatch to adapter
  adapters/
    datadog.ts                neutral -> Datadog metric query + Logs Search + Events/Monitors REST
    grafana.ts                neutral -> PromQL + LogQL + Annotations/Provisioning API
    newrelic.ts               neutral -> NRQL over NerdGraph + changeTracking mutation
  investigation.ts            the 13-step sampled SRE investigation + expressibility scorer (CLI)
fixtures/                     recorded vendor responses for parse() tests
test/
  translation.datadog.test.ts  exact-query assertions vs documented Datadog syntax
  translation.grafana.test.ts  exact-query assertions vs documented PromQL/LogQL
  translation.newrelic.test.ts exact-query assertions vs documented NRQL
  swap.test.ts                 EXIT 2: backend swap with zero agent-facing change
  budget.test.ts               EXIT 3: quota decrement, attribution, pre-exhaustion + hard reject
  expressibility.test.ts       EXIT 1: >=90% per backend + escape-hatch visibility
  envelope.test.ts             real-schema validation + fixture parsing
```

## Run

```bash
cd platform/spikes/s5-capability-schema
npm install            # local node_modules; NOT a workspace member
npm test               # all suites incl. swap + per-backend translation tests
npm run investigation  # prints per-backend expressibility % and sample translations
npx tsc --noEmit       # typecheck (tsx does not typecheck at runtime)
```

`npm install` is run with cwd = this directory. The spike imports the schemas package by
relative path (`../../../packages/schemas/src/index.ts`) and resolves `ajv`/`ajv-formats`
from its own `node_modules`.
