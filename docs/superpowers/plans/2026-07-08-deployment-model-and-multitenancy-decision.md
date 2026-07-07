---
id: DECISION-OPSBENCH-DEPLOY-001
title: "Deployment model & multi-tenancy: hosted PaaS/SaaS vs self-hosted (open decision)"
status: open
created: 2026-07-08
author: "Claude Code session (Shaik Noorullah, driver)"
relates_to: "PRD-OPSBENCH-001 (00-overview §5, §6, §7); gap-analysis §6, §9; SPEC-OPSBENCH-001 (00-architecture, tenancy)"
---

# Deployment model & multi-tenancy — an open decision

## Summary

Whether opsbench ships as a **hosted PaaS/SaaS**, as **self-hosted** enterprise software,
or **both**, is an open business-and-architecture decision that materially changes which
requirements are foundational versus deferrable.

The tension in one sentence: **a hosted multi-tenant SaaS makes tenant isolation (NF-006)
and multi-tenancy non-negotiable, launch-blocking foundations** — and adds net-new scope
that is not in the current 16 components — **while the PRD is written enterprise-self-hosted-first
for a buyer (security & compliance) who may specifically resist letting a third party host
the control plane that holds production-write credentials.**

## Why this matters now

A prior "how far have we come" assessment flagged multi-tenancy and NF-006 tenant isolation
as **not built** (the assembled spine is in-memory and effectively single-tenant). Whether
that is a *deferrable enterprise feature* or a *Phase-0 launch blocker* depends entirely on
the deployment model — so the model needs to be a conscious decision, not an accident of
what got built first.

## What the PRD currently assumes

The PRD (`docs/superpowers/prd/opsbench-platform/00-overview.md`) leans **enterprise,
customer-deployed, self-hosted-first**:

- **G-8** — enterprise-deployable: SSO/SCIM, multi-tenant RBAC, hierarchical governed
  memory, **self-hosted and (later) air-gapped tiers**, data residency, BYO-model.
- **§5.4 / out-of-scope** — BYO-model / BYO-key via the customer's **own cloud tenancy** is
  a procurement-gating constraint; no feature may depend on a single model vendor.
- **DP-6** — stack-neutral, **exit-friendly**; learnings egress in open formats to
  customer-owned systems.
- **NG-6** — air-gapped deployment in the initial release is a non-goal (delivered later,
  architecturally protected).
- **NG-7** — a **consumer or small-team self-serve product motion is an explicit non-goal.**

Net: a hosted PaaS/SaaS is **not currently in the PRD**. It is a new business-model option
under consideration, and it partly cuts against the stated posture.

## The core tension

The economic buyer is **security & compliance**. The pitch is *"provably-safe production
write access."* That buyer is often the *least* willing to let a third party host the
control plane that holds write credentials to their production estate. So a **pure hosted
multi-tenant SaaS runs against the grain of the very buyer the moat targets.** This is not
fatal — but it means "go hosted" is not just more engineering; it is a harder sale to the
core ICP, and it needs a compliance/trust story strong enough to overcome it.

## Two levels of multi-tenancy (do not conflate them)

| Level | What it is | Needed by |
|---|---|---|
| **Within-org** | agent → team → dept → workspace → org: hierarchical governed memory, team RBAC, NF-006 isolation *inside one customer* | **Both** models — one company has many teams |
| **Cross-customer** | many companies on shared infrastructure | **Hosted SaaS only** |

Consequence: **multi-tenancy is foundational either way.** "We can't provide multi-tenancy"
is inaccurate — we have not *built* it yet; the deployment model changes its **urgency**,
not whether it is needed. Building it correctly (tenant-id structural, isolation enforced)
serves single-tenant self-hosted, multi-tenant self-hosted, and hosted SaaS from **one
codebase**. This is exactly why the gap-analysis lists multi-tenancy plumbing as a Phase-0
foundation.

## Current build state (2026-07-08)

- **Tenant-aware:** `TenantID` is first-class — on every `Action`, per-tenant hash chains in
  C5, tenant on C1 decision records. The seam exists.
- **NOT tenant-isolated:** no Postgres row-level security, Redis key/stream prefixes, Cedar
  entity-store partitions, memory namespaces, or the **NF-006 adversarial isolation suite**.
  Stores are in-memory; the assembled spine is effectively single-tenant.

So we are not at zero on multi-tenancy — the data model is tenant-aware — but the
**enforcement layer** (and its adversarial test gate) is not yet built.

## Deployment models & trade-offs

| Model | Fit with the security buyer | Net-new scope beyond the core | GTM / revenue |
|---|---|---|---|
| **Self-hosted** (customer's cloud/infra) — PRD default | Easiest: "we never hold your keys or data" | Within-org multi-tenancy only | Slower, higher-touch onboarding |
| **Hosted multi-tenant SaaS** | Hardest: you hold prod-write keys for many customers | Full cross-tenant isolation + billing + provisioning + hosted compliance + residency + key management | Fastest, recurring, lowest friction |
| **Hybrid** (hosted control plane + customer-resident data/credential plane) | Often the sweet spot: SaaS ergonomics, **credentials/data never leave the customer estate** | Multi-tenancy for the control plane; a split-plane deployment | Good middle ground |

## Net-new scope a hosted SaaS adds (not in the 16 components today)

- **Metering + billing**, and enforcing spend caps as *our* liability (SM-9: "surprise-invoice = 0").
- **Automated tenant provisioning** (SM-8: ≤ 1 business day, self-serve or ops-driven).
- **Per-tenant key management** + **data residency** (region pinning).
- **SOC2 / compliance for the hosted service itself** (in addition to the evidence the
  product produces *for* customers).
- The operational security posture of **holding many customers' production-write credentials.**

## Recommendation (proposed — not yet decided)

1. **Build multi-tenancy into the foundation regardless of model.** It is required
   within-org for the enterprise product, and it unblocks every deployment option from one
   codebase. This is the Phase-0 foundation the gap-analysis already names; do not treat it
   as SaaS-gated.
2. **Lead GTM self-hosted (or hybrid).** The **C4 credential broker being customer-resident**
   is precisely what enables a hybrid "hosted control plane, your keys" model — likely the
   enterprise sweet spot for this buyer.
3. **Add a hosted multi-tenant tier later**, once isolation + billing + provisioning +
   hosted-compliance are real. Do **not** pull that scope forward before the core wedge
   (provably-safe write + offline-verifiable evidence) is proven.
4. **Treat deployment model as a GTM decision layered on a multi-tenant core — not an
   architecture fork.** Build the foundation once; choose how to deploy it as a business call.

## Open questions / decision owners

- Do we commit to a hosted tier at all, and at what stage? — *Founders / GTM*
- If hybrid: the exact control-plane / data-plane split — where do the credential broker and
  audit ledger live? — *Architecture*
- Does NG-7 (no self-serve motion) still hold if a hosted tier lowers adoption friction? — *Product*
- What compliance posture (SOC2, etc.) is required to host production-write credentials, and
  on what timeline? — *Security & compliance*

## Decision log

- **2026-07-08** — Conflict surfaced and documented (this file). Status: **open**, no
  deployment model committed. Prior work has built the governed-action spine tenant-aware
  but single-tenant; multi-tenancy enforcement + NF-006 remain to be built.
