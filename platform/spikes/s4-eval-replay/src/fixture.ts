// Synthetic closed-incident fixture.
//
// Scenario: a checkout-service latency/error incident in prod-eu caused by a bad
// deploy (a connection-pool misconfiguration). Humans rolled back the deploy.
//
// The evidence store spans the incident window AND extends past the cutoff. The
// post-cutoff items are deliberately "leading" — they name the root cause and
// the fix directly. A replayed agent that could read them would be cheating
// (hindsight leakage). Temporal isolation must make them inaccessible.

import type { IncidentFixture } from "./types.ts";

// Window anchors (UTC). The agent may only see evidence with ts <= cutoff_ts.
const OPENED = "2026-05-01T10:00:00Z";
const CUTOFF = "2026-05-01T10:45:00Z"; // investigation window cut-off
const CLOSED = "2026-05-01T11:30:00Z";

export const fixture: IncidentFixture = {
  incident: {
    incident_id: "inc_00000000000000000000000001",
    tenant_id: "t_acme",
    scenario_class: "k8s.deploy_regression",
    environment: "prod-eu",
    window: { opened_ts: OPENED, cutoff_ts: CUTOFF, closed_ts: CLOSED },
    hypotheses_tested: [
      { id: "h_dep", statement: "Recent checkout deploy regressed connection pooling", verdict: "confirmed" },
      { id: "h_db", statement: "Primary database degraded independently", verdict: "rejected" },
      { id: "h_net", statement: "Cross-AZ network partition", verdict: "rejected" },
    ],
    actions_taken: [
      { id: "a_rollback", description: "Rolled back checkout to previous revision", ts: "2026-05-01T11:05:00Z" },
      { id: "a_verify", description: "Verified error rate returned to baseline", ts: "2026-05-01T11:20:00Z" },
    ],
    outcome_flags: { recovered: true, data_loss: false, customer_impact: true },
    resolution: {
      detection: { symptom: "checkout 5xx error-rate spike", first_seen_ts: "2026-05-01T10:07:00Z" },
      localization: { service: "checkout", component: "db-connection-pool" },
      rca: {
        cause_id: "rc_pool_exhaustion",
        summary: "Deploy rev 7f3a set maxPoolSize=2, exhausting connections under load.",
      },
      mitigation: {
        action_id: "mit_rollback_deploy",
        summary: "Roll back checkout to the prior revision to restore pool sizing.",
      },
    },
  },
  evidence: [
    // ---- PRE-CUTOFF (visible to the replayed agent) ----
    {
      id: "ev_001",
      ts: "2026-05-01T10:01:00Z",
      kind: "deploy",
      source: "argocd:prod-eu/checkout",
      body: "Deployed checkout revision 7f3a (config change to connection pool).",
      tags: { service: "checkout", revision: "7f3a", change: "config" },
    },
    {
      id: "ev_002",
      ts: "2026-05-01T10:07:00Z",
      kind: "alert",
      source: "datadog:org-1",
      body: "ALERT: checkout 5xx error-rate above SLO (12% > 1%).",
      tags: { service: "checkout", symptom: "5xx_spike", signal: "error_rate" },
    },
    {
      id: "ev_003",
      ts: "2026-05-01T10:08:00Z",
      kind: "metric",
      source: "prometheus:prod-eu",
      body: "checkout_db_pool_wait_seconds p99 climbing; active connections pinned at max.",
      tags: { service: "checkout", component: "db-connection-pool", metric: "pool_wait" },
    },
    {
      id: "ev_004",
      ts: "2026-05-01T10:09:00Z",
      kind: "log",
      source: "k8s:prod-eu/checkout",
      body: "ERROR pool: timeout acquiring connection (maxPoolSize reached) revision=7f3a",
      tags: { service: "checkout", component: "db-connection-pool", revision: "7f3a", error: "pool_timeout" },
    },
    {
      id: "ev_005",
      ts: "2026-05-01T10:12:00Z",
      kind: "metric",
      source: "prometheus:prod-eu",
      body: "primary db cpu 40%, replica lag nominal — db itself healthy.",
      tags: { service: "database", component: "primary", metric: "cpu", health: "ok" },
    },
    {
      id: "ev_006",
      ts: "2026-05-01T10:30:00Z",
      kind: "log",
      source: "k8s:prod-eu/checkout",
      body: "ERROR pool: timeout acquiring connection (maxPoolSize reached) — sustained",
      tags: { service: "checkout", component: "db-connection-pool", revision: "7f3a", error: "pool_timeout" },
    },
    // ---- POST-CUTOFF (must be INACCESSIBLE — these are hindsight leaks) ----
    {
      id: "ev_post_rollback",
      ts: "2026-05-01T11:05:00Z",
      kind: "deploy",
      source: "argocd:prod-eu/checkout",
      body: "ROLLBACK checkout to prior revision — restored maxPoolSize. ROOT CAUSE: rev 7f3a pool config.",
      tags: { service: "checkout", action: "rollback", reveals: "root_cause_and_fix" },
    },
    {
      id: "ev_post_recovered",
      ts: "2026-05-01T11:20:00Z",
      kind: "metric",
      source: "datadog:org-1",
      body: "checkout 5xx back to baseline after rollback. Incident resolved.",
      tags: { service: "checkout", state: "recovered", reveals: "outcome" },
    },
  ],
};
