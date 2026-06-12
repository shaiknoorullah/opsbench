---
title: Opsbench Platform — Agent-Team Architecture, Policy, Memory & Safety Research
date: 2026-06-12
status: research
branch: research/enterprise-agentops-platform
---

# Opsbench Platform — Agent-Team Architecture, Policy, Memory & Safety Research

## Executive Summary

The research across five dimensions — multi-agent orchestration, scoped policy gating, hierarchical memory, incident-context systems, and safety-by-design — converges on a single strategic conclusion: **the orchestration layer is commoditized; the governance, memory, and evidence layers above it are open ground.** Every major vendor (Anthropic, LangGraph, Microsoft, OpenAI, CrewAI) ships the same five-ish orchestration patterns ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system), [Microsoft Learn](https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/), [OpenAI](https://openai.github.io/openai-agents-python/multi_agent/), [CrewAI](https://docs.crewai.com/en/introduction)), and the tool ecosystem our platform sits in already provides production-grade MCP servers for Kubernetes, Grafana, Terraform, and Datadog ([containers/kubernetes-mcp-server](https://github.com/containers/kubernetes-mcp-server), [grafana/mcp-grafana](https://github.com/grafana/mcp-grafana), [hashicorp/terraform-mcp-server](https://github.com/hashicorp/terraform-mcp-server), [Datadog Bits AI MCP](https://github.com/datadog-labs/mcp-server)). What no one ships is the integrated layer this document specifies: per-agent/per-team policy scoping with Cedar-or-OPA-class engines and formally analyzable rules; cryptographically verifiable audit of every agent action; org/team/department/workspace hierarchical memory with RBAC (whitespace across Redis, Zep, Mem0, and Letta); a decision-and-outcome incidents ledger with provenance-rich memory governance; and an "earned autonomy" safety loop — plan/approve/apply, mandatory dry-run, blast-radius limits, dual control, layered kill switches, and human escalation up to voice-calling on-site SREs.

Key quantitative anchors: multi-agent systems cost ~15x chat-level tokens but beat single agents by 90.2% on Anthropic's research eval ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)); users rubber-stamp 93% of naive permission prompts ([Anthropic auto-mode](https://www.anthropic.com/engineering/claude-code-auto-mode)); current models resolve only 13.8% of real-world SRE scenarios on ITBench (medium confidence, via [Augment Code](https://www.augmentcode.com/guides/ai-sre-ai-powered-site-reliability-engineering)); and only 12 of 200+ real postmortems examined by Cleric contained usable root causes ([Cleric](https://cleric.ai/blog/the-hidden-complexity-of-building-an-ai-sre)). These numbers justify the platform's posture: conservative default autonomy, deterministic policy outside the model, governed memory, and evidence captured at decision time rather than reconstructed afterward.

---

## 1. Teams-of-Agents Design: Roles, Work Division, Review Loops, Arbitration

### 1.1 The converged pattern vocabulary

Orchestration patterns are table stakes. Every major framework ships supervisor/orchestrator-worker, handoffs, group chat, deterministic flows, and a ledgered planner:

| Framework | Patterns | Distinctive mechanics | Source |
|---|---|---|---|
| Anthropic research system | Orchestrator-worker | Opus 4 lead + Sonnet 4 subagents; +90.2% over single-agent Opus 4; 3–5 parallel subagents, 3+ parallel tool calls each | [Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system) |
| LangGraph | Supervisor, hierarchical supervisors | `create_supervisor()`, `create_handoff_tool()`, verbatim forwarding to avoid re-summarization cost | [LangChain reference](https://reference.langchain.com/python/langgraph-supervisor) |
| Microsoft Agent Framework | Sequential, Concurrent, Handoff, Group Chat, Magentic | Magentic-One dual-ledger built in; approval-required tools pause workflows | [Microsoft Learn](https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/) |
| OpenAI Agents SDK | Manager (`Agent.as_tool()`), Handoffs | Recommends code-driven orchestration as "more deterministic and predictable" | [OpenAI docs](https://openai.github.io/openai-agents-python/multi_agent/) |
| CrewAI | Flows + Crews | Deterministic Flow backbone; embed autonomous Crews only where teamwork is needed | [CrewAI docs](https://docs.crewai.com/en/introduction) |

The reference planner is Magentic-One: an outer loop over a Task Ledger (facts, guesses, plan) and an inner loop over a Progress Ledger (completion check, progress evaluation, agent assignment), with a stall counter triggering re-planning ([Microsoft Research](https://www.microsoft.com/en-us/research/articles/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/)). Our platform should **adopt this ledger semantics as a normalized data model, not re-implement orchestration**.

### 1.2 Role specialization: orchestrator-executor-reviewer is the practitioner default

The practitioner ecosystem has independently converged on the same role split that the vendors formalize. Across [wshobson/agents](https://github.com/wshobson/agents) (16 multi-agent orchestrators), [obra/superpowers](https://github.com/obra/superpowers) (subagent-driven development), and [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) (100+ subagents with a clean tool-permission model), the dominant production pattern is:

- **Orchestrator** — routes work; minimal tool access; never executes.
- **Executors** — full edit/mutation tools, scoped to owned modules (git-worktree isolation prevents trampling, per [obra/superpowers](https://github.com/obra/superpowers)).
- **Reviewers** — strictly read-only (`Read, Grep, Glob`); **spec-compliance review and code-quality review run as two distinct passes** (Superpowers convention).

This role-to-permission mapping is the bridge between Section 1 and Section 2: roles are only meaningful if the policy layer can enforce them. VoltAgent's read-only-reviewer convention and Trail of Bits' parallel `/review-pr` pattern (multiple independent reviewer agents, findings merged, fixes pushed — [trailofbits/claude-code-config](https://github.com/trailofbits/claude-code-config)) are the templates for our **mandatory review loop**: no executor output reaches an apply step without at least one independent read-only reviewer pass, and high-risk changes require two reviewers with disjoint identities (dual control, Section 5).

### 1.3 Work division and the write-path rule

The Cognition-vs-Anthropic debate resolves into codifiable guidance. Cognition: multi-agent systems fail through fragmented context — "Share context, and share full agent traces, not just individual messages" ([Cognition](https://cognition.ai/blog/dont-build-multi-agents)). LangChain's synthesis: multi-agent suits **read-heavy, breadth-first, parallelizable** work; write actions belong to a single agent — even Anthropic parallelizes reading but reserves writing for "a single main agent in one unified call" ([LangChain](https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems)). The platform should ship this as **topology linting**: flag parallel-write team designs at registration time, recommend single-writer-many-reader shapes, and enforce them via policy.

### 1.4 Arbitration and failure detection

When agents disagree or stall, three mechanisms apply, in escalating order:

1. **Ledger-level arbitration** — Magentic-One's stall counter and re-planning loop is the in-band mechanism; our platform detects stalls externally via task-status lag (Claude Code teammates demonstrably fail to mark completion — [agent teams docs](https://code.claude.com/docs/en/agent-teams)).
2. **Reviewer veto** — exit-code-2 hook semantics block task transitions; a reviewer "deny" is final unless a human overrides.
3. **MAST-aligned detectors** — MAST identifies 14 failure modes in 3 categories (specification, inter-agent misalignment, verification) from 150 rigorously analyzed traces (kappa=0.88) plus a 1600+ trace dataset across 7 frameworks, with an open LLM-as-judge annotator ([arXiv:2503.13657](https://arxiv.org/abs/2503.13657)). This is a ready-made observability spec: run MAST detectors over every team trace and route inter-agent-misalignment findings to a human arbiter.

### 1.5 Economics and durability gaps

Agents use ~4x chat tokens; multi-agent ~15x; token usage explains 80% of performance variance on BrowseComp ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)). Claude Code teams scale cost linearly per teammate (guidance: 3–5 teammates, 5–6 tasks each). Per-agent/per-task/per-team cost attribution and budget caps are therefore first-order features. Token hygiene also matters at the tool layer: "the GitHub MCP alone eats 46,000 tokens across 91 tools before you type anything. Cursor eventually capped MCPs at 40 tools" ([Pulumi 2026](https://www.pulumi.com/blog/top-8-claude-skills-devops-2026/)) — the platform must budget tool-surface tokens per agent role, preferring skill-style progressive disclosure and `enabled-tools` allowlists.

Every documented limitation of first-party primitives maps to a platform feature: Claude Code team state in `~/.claude/teams/` is deleted on cleanup (we provide durable task-ledger storage); `/resume` does not restore teammates (we provide team checkpointing/replay); all teammates inherit the lead's permission mode including `--dangerously-skip-permissions` (we provide per-agent policy — Section 2); subagents are one level deep (we provide cross-team topology management) ([agent teams docs](https://code.claude.com/docs/en/agent-teams), [SDK subagents](https://code.claude.com/docs/en/agent-sdk/subagents)). Cross-framework identity and tracing normalize onto A2A v1.0 (150+ orgs, signed Agent Cards, Linux Foundation governance, IT operations named as a production vertical — [Linux Foundation](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year)) plus MCP.

```
                       AGENT-TEAM TOPOLOGY (single-writer, mandatory review)

   +------------------+        Task Ledger (durable, platform-owned)
   |   ORCHESTRATOR   |<------ facts / plan / progress / stall counter
   | (route-only,     |
   |  minimal tools)  |
   +--------+---------+
            | assigns (dependency-aware)
   +--------+----------------------------------------+
   |                |                |                |
   v                v                v                v
+--------+      +--------+      +--------+      +-----------+
|READER 1|      |READER 2|      |READER 3|      | EXECUTOR  |   <- ONE writer
|read-only      |read-only      |read-only      | (scoped   |
|fan-out |      |fan-out |      |fan-out |      |  mutations)|
+---+----+      +---+----+      +---+----+      +-----+-----+
    \________________|_______________/                |
            evidence merged                           v
                                          +---------------------+
                                          |  REVIEW LOOP (mand.)|
                                          |  pass 1: spec       |
                                          |  pass 2: quality    |
                                          |  read-only tools    |
                                          +----------+----------+
                                            veto |       | approve
                                                 v       v
                                          ARBITRATION   POLICY GATEWAY
                                          (human or     (Section 2) ->
                                           re-plan)      apply path
```

---

## 2. Policy Gating: Scoped Permissions, Approval Gates, Immutable Audit

### 2.1 Reference architecture: gateway + external policy engine + decision log

AWS made the architecture the industry default with Policy in Bedrock AgentCore (GA [March 3, 2026, 13 regions](https://aws.amazon.com/about-aws/whats-new/2026/03/policy-amazon-bedrock-agentcore-generally-available/)): LLMs cannot enforce their own constraints, so authorization is an external checkpoint the model cannot circumvent ([AWS Security Blog](https://aws.amazon.com/blogs/security/why-policy-in-amazon-bedrock-agentcore-chose-cedar-for-securing-agentic-workflows/)). Enforcement at three points: (1) **runtime evaluation** of every tool call, default-deny; (2) **discovery filtering** — Cedar partial evaluation removes forbidden tools from tool lists so agents never see what they cannot call; (3) **control-plane formal analysis** — Cedar Analysis detects conflicts and tautologies at policy-attachment time. Dual enforcement (discovery + runtime) also appears in [agentgateway](https://agentgateway.dev/docs/standalone/latest/mcp/mcp-authz/) and [Red Hat's wristband-JWT design](https://developers.redhat.com/articles/2025/12/12/advanced-authentication-authorization-mcp-gateway); it is a hard MVP requirement.

### 2.2 Policy engines: pluggable languages, one decision record

| Engine | Production use | Strengths | Notes |
|---|---|---|---|
| Cedar | AgentCore Policy | Default deny, forbid-wins, O(n) bounded eval, formal analysis | CNCF sandbox; NL-to-Cedar authoring reproducible with open tooling |
| CEL | agentgateway MCP authz | Per-method rules (`list_tools`, `call_tools`); auto-filters denied tools | [docs](https://agentgateway.dev/docs/standalone/latest/mcp/mcp-authz/) |
| OPA/Rego | Red Hat pattern; [CodiLime network infra](https://codilime.com/blog/why-use-open-policy-agent-for-your-ai-agents/) | Three-layer ABAC; decision logs correlating JWT + agentId + mcpRequestId | Millisecond eval; 10–20 s bundle-distribution consistency window |
| Permit RBAC/ABAC/ReBAC | [Permit.io MCP Gateway](https://docs.permit.io/permit-mcp-gateway/) | Risk-classified tools, per-user trust ceilings | Deny-by-default drop-in proxy |

The strategic move: **treat the engine as pluggable (Cedar first-class, Rego/CEL adapters) and standardize the decision record.** The evaluation log — agent identity, human authorizer, resource, operation, decision, governing policy, timestamp — is the durable asset.

### 2.3 Per-agent and per-team scoping in practice

Scoping composes three layers our research already validates individually:

1. **Tool-surface scoping** — official MCPs ship the knobs: `grafana/mcp-grafana --disable-write`, `containers/kubernetes-mcp-server --read-only` with a dedicated read-only ServiceAccount, Datadog official MCP read-only by default, Terraform MCP requiring `ENABLE_TF_OPERATIONS=true` for destructive ops ([goldmine survey](https://github.com/grafana/mcp-grafana)). The universal practitioner rule: "start with read-only permissions, and scope access carefully before giving write access to production systems" ([k8slens guide](https://medium.com/k8slens/18-best-devops-mcp-servers-for-2026-the-definitive-guide-bfde04654a35)).
2. **In-agent gating** — Claude Agent SDK [PreToolUse hooks](https://code.claude.com/docs/en/agent-sdk/hooks): `allow`/`deny`/`ask`/`defer` with deny > defer > ask > allow precedence, input rewriting via `updatedInput`, async side-effect-only hooks for zero-latency audit. Gotchas to engineer around: subagents don't inherit permissions; hooks may not fire at max_turns; 60 s default timeout.
3. **Gateway-side enforcement** — adopt, don't build: [agentgateway](https://agentgateway.dev/) (Apache 2.0, Linux Foundation; mTLS/OIDC, CEL authz, OTel by default, native MCP + A2A) or the [agentic-community MCP Gateway & Registry](https://github.com/agentic-community/mcp-gateway-registry) (OAuth via Keycloak/Entra/Okta, per-tool scopes, who/what/when/where/outcome audit with credential masking).

Self-hosting is the credential-discipline baseline: "With self-hosted MCP, a jailbreak can only access what YOUR security policies allow. With SaaS, a jailbreak gets everything you uploaded" ([Cloudshipai 2026](https://www.cloudshipai.com/blog/mcp-servers-devops-complete-guide-2026)); and never expose MCP servers publicly ([Fly.io](https://fly.io/docs/mcp/access-control/flycast/)).

**Identity:** SPIFFE/SPIRE is converging as agent workload identity — Vault Enterprise added native SPIFFE auth and a SPIFFE secrets engine ([HashiCorp](https://www.hashicorp.com/en/blog/spiffe-securing-the-identity-of-agentic-ai-and-non-human-actors)); [Stacklok's reference architecture](https://stacklok.com/blog/agentic-identity-explained-how-to-apply-spiffe-and-relationship-based-authorization-to-ai-agents-in-2026/) rotates SVIDs hourly and pairs SPIFFE with ReBAC (OpenFGA/SpiceDB) so every decision carries the delegation chain. First-class agent SVIDs plus delegation-chain audit remains an open differentiation window.

### 2.4 Approval gates

Three validated gate styles compose into one workflow surface: (a) the Anthropic SRE cookbook's `request_approval` pattern — session idles at `awaiting_user`, human reviews the diff, "Never call merge_pull_request unless request_approval returned 'approved'" ([managed_agents cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/managed_agents)); (b) PreToolUse `ask` decisions; (c) gateway-side Cedar "forbid unless approved" with threshold auto-approval and Slack routing. HumanLayer's pivot away from standalone approval APIs to CodeLayer ([humanlayer.dev](https://www.humanlayer.dev/)) signals approvals are a platform feature, not a standalone market.

### 2.5 Immutable audit

[Kiteworks](https://www.kiteworks.com/regulatory-compliance/ai-agent-audit-trail-siem-integration/) sets the falsifiable bar — six mandatory fields per action (agent identity, authenticated human authorizer, specific data accessed, operation, policy decision + governing policy, tamper-evident timestamp), with cryptographic chaining or WORM storage required; access controls on logs do not qualify. Regulatory hooks exist now (HIPAA §164.312(b), CMMC AU.2.042, SEC 17a-4, NYDFS §500.6). Sigstore's [Rekor](https://docs.sigstore.dev/logging/overview/) (Merkle-tree transparency log, inclusion proofs, independent monitors) is the reusable blueprint; **no agent platform ships this today** — it is Differentiator 1. (SOC 2 cost/failure figures from [Agentplace](https://agentplace.io/blog/soc-2-type-ii-for-agent-platforms-security-certification-roadmap/) are vendor-published and unverified; do not quote externally.)

```
              POLICY & AUDIT CONTROL PLANE (gateway-centric)

  Agents (Claude teams / LangGraph / CrewAI / A2A peers)
     |  SPIFFE SVID + delegation chain (JWT/Agent Card)
     v
+-----------------------------------------------------------+
|  PLATFORM CONTROL PLANE (we build this)                    |
|   NL->Cedar authoring -> schema check -> formal analysis   |
|   cross-gateway policy distribution    approval router     |
|   (Slack/console, dual-control)        budget/cost caps    |
+------------------+----------------------------------------+
                   | policies (Cedar | Rego | CEL adapters)
                   v
+-----------------------------------------------------------+
|  GATEWAY (adopted OSS: agentgateway-class)                 |
|   [1] discovery filter: hide forbidden tools               |
|   [2] runtime check: default-deny every call               |
|   [3] token exchange: narrow scopes per backend (RFC 8693) |
+----+-------------------+-------------------+---------------+
     v                   v                   v
  K8s MCP (--read-only) Grafana MCP        Terraform MCP ...
  scoped ServiceAccount (--disable-write)  (no TF ops unless opted)
                   |
                   v  every decision (allow AND deny)
+-----------------------------------------------------------+
|  EVIDENCE-GRADE AUDIT: 6-field records -> Merkle-chained   |
|  transparency log (Rekor-style) -> SIEM export (real-time) |
+-----------------------------------------------------------+
```

---

## 3. Hierarchical Agent Memory on Redis

### 3.1 Adopt the engine, own the hierarchy

The open-source [redis/agent-memory-server](https://github.com/redis/agent-memory-server) (Apache-2.0, v0.15.2) is the most production-ready self-hostable memory engine: dual REST (port 8000) and MCP (port 9000) interfaces; two-tier architecture (session working memory with 1-hour TTL and auto-summarization at threshold 0.7, promoted by a background pipeline into vector-indexed long-term memory); four extraction strategies (discrete facts, summary, preferences, custom); semantic/episodic/message memory types; semantic + BM25 + hybrid search (`hybrid_alpha=0.7` default); dual deduplication (hash + LLM-merged semantic); four forgetting policies; pluggable vector backends (Redis HNSW default, Pinecone, Chroma, PostgreSQL); LiteLLM multi-provider access ([docs](https://redis.github.io/agent-memory-server/)).

What it deliberately does not implement is anything above `namespace`: **no org, team, department, or workspace objects, and no namespace-level RBAC.** Scoping is exactly `session_id`, `user_id`, and a free-form `namespace` string; OAuth2 auth authenticates callers but does not map tokens to permitted namespaces ([configuration docs](https://redis.github.io/agent-memory-server/configuration/)). That missing layer is our product surface:

1. **Namespace convention compiler** — enforce `org:acme/dept:eng/team:platform/agent:x` at write time.
2. **Claims-based policy proxy** — JWT claims → allowed namespaces, in front of every REST/MCP call. This proxy is the same policy plane as Section 2: memory reads/writes are tool calls and flow through the same Cedar/OPA decision point and audit log.
3. **Multi-scope recall fan-out** — query agent + team + department + org tiers in parallel; merge with recency/relevance ranking.
4. **Per-tier retention and audit** — compliance-driven TTL and forgetting per scope (legal holds per department), auditable end-to-end.

### 3.2 Hierarchy semantics

Recommended access defaults, enforced by the proxy: an agent **writes** only to its own namespace; **reads** ascend the hierarchy (own → team → department → workspace → org) unless policy narrows it; **promotion** of a memory upward (agent-learned fact becomes team knowledge) is a reviewed operation — a human or designated curator agent (Letta-style sleep-time curation, [Letta docs](https://docs.letta.com/guides/agents/multi-agent-shared-memory)) approves elevation, and the promotion event lands in the audit log with provenance.

```
        HIERARCHICAL MEMORY (engine: redis/agent-memory-server)

  org:acme                          <- org-wide verified facts
   +-- workspace:prod-ops           <- shared runbooks, conventions
   |    +-- dept:engineering        <- per-dept retention policy / legal hold
   |    |    +-- team:platform
   |    |    |    +-- agent:sre-investigator   (write scope)
   |    |    |    +-- agent:k8s-executor
   |    |    +-- team:data
   |    +-- dept:security
   |
   |  READS ascend  ^   WRITES stay local   PROMOTION = reviewed + audited
   v
+---------------------------------------------------------------+
| CLAIMS->NAMESPACE POLICY PROXY (we build; same Cedar plane     |
| as Sec. 2; rejects unscoped writes; forbids catch-all defaults)|
+---------------------------------------------------------------+
            |  REST :8000        |  MCP :9000
            v                    v
+---------------------------------------------------------------+
| agent-memory-server: working mem (TTL 1h, summarize @0.7)      |
|  -> promotion pipeline -> long-term (vector + BM25 hybrid)     |
|  dedup (hash + LLM merge) | forgetting (worker-dependent!)     |
+---------------------------------------------------------------+
```

### 3.3 Operational hazards and competitive whitespace

Two engineering cautions from the research: (1) forgetting is **off by default** and both forgetting and compaction silently no-op without a running docket task worker — worker liveness must be a first-class health check; (2) Redis's docs disagree with themselves on forgetting defaults (90/30/10000 vs 30/7/1000) while shipped code leaves them unset ([lifecycle](https://redis.github.io/agent-memory-server/memory-lifecycle/) vs [configuration](https://redis.github.io/agent-memory-server/configuration/)) — pin versions and test observed behavior. The documented `DEFAULT_MCP_USER_ID`/`DEFAULT_MCP_NAMESPACE` fallbacks are a silent cross-tenant-merge hazard; our deployment standard prohibits them and the proxy rejects unscoped writes.

Competitively, none of Redis, [Zep/Graphiti](https://arxiv.org/abs/2501.13956) (bi-temporal knowledge graph; 94.8% DMR), [Mem0](https://arxiv.org/abs/2504.19413) (conflict-aware update phase; 91% lower p95), or [Letta](https://docs.letta.com/guides/agents/multi-agent-shared-memory) ships org-hierarchy RBAC — **hierarchical governed memory is genuine whitespace.** Redis's own [LOCOMO benchmarking](https://redis.io/blog/long-term-memory-architectures-ai-agents/) quantifies the central dial: full-context 72.9% accuracy / 17.12 s p95 / ~26k tokens vs selective memory 66.9% / 1.44 s / ~1.8k tokens — ~6 accuracy points for 91% latency and 90% token savings. Expose this as a **per-team policy dial**, with hybrid retrieval as the default. Keep an optional graph layer (Zep-style) on the roadmap for relational, fact-invalidating organizational knowledge; track [LangCache](https://redis.io/blog/langcache-public-preview/) (public preview; vendor-claimed up to 15x faster / 70% token savings on hits — unverified, no GA SLA) off the critical path.

---

## 4. Context Systems: Incidents Ledger, Facts, Stack Understanding, Live Health

### 4.1 The three-layer context model is mandatory architecture

Datadog Bits AI SRE defines the cleanest layering ([Datadog docs](https://docs.datadoghq.com/bits_ai/bits_ai_sre/knowledge_sources/)):

| Layer | Example implementation | Trust/freshness | Governance |
|---|---|---|---|
| Verified static org facts | `bits.md`-style file: tagging conventions, environment normalization, known noise patterns | High trust, low churn, human-authored | Edited like config |
| Procedural runbooks | Monitor-linked telemetry URLs, notebooks, Confluence read at investigation time; runbook-as-skill (`SKILL.md` per failure signature, per the [Anthropic SRE cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/03_The_site_reliability_agent.ipynb)) | Medium trust, fetched fresh | Doc ownership |
| Feedback-derived memories | Auto-generated from investigation feedback; per-investigation selection | Lowest trust, highest churn | User-inspectable, deletable |

These map directly onto the Section 3 hierarchy: verified facts live in org/workspace namespaces, runbooks in team namespaces, learned memories in agent namespaces pending promotion. Datadog already ships memory view/delete, so basic governance is table stakes; **we exceed it with provenance** — every memory records which incident taught it and on what evidence.

### 4.2 The decision-and-outcome ledger (Differentiator)

The structural floor is incident.io: incidents with severities, custom fields, roles, timestamps, and a Catalog graph behind a versioned REST API (1,200 req/min, Bearer auth, 3-month deprecation windows), plus live-synced post-mortem documents with a Document API explicitly aimed at "custom integrations, LLM agents and knowledge bases" ([API reference](https://docs.incident.io/api-reference), [post-mortems launch](https://incident.io/blog/post-mortems-launch)). We **ingest from these APIs rather than expecting re-entry**.

But after-the-fact postmortems are insufficient: Cleric found only 12 of 200+ real customer postmortems contained clear root causes with sufficient context ([Cleric](https://cleric.ai/blog/the-hidden-complexity-of-building-an-ai-sre)). The differentiating ledger therefore records, **at decision time**: actions taken (agent or human), hypotheses tested, evidence for/against, and whether each action worked. The Bradford Hill / DAG discipline of the [`causal-inference-root-cause` skill](https://github.com/lyndonkl/claude/blob/main/skills/causal-inference-root-cause/SKILL.md) — evidence columns, no hand-waved causal percentages — and 5-Whys evidence tables ([5-whys-skill](https://github.com/awesome-skills/5-whys-skill)) supply the record schema for hypothesis entries. No incumbent stores this.

### 4.3 Retrieval, economics, and bias

Validated retrieval shape: pre-process incidents along alert type, impacted systems, and symptoms; run independent per-dimension similarity searches; merge and LLM-rerank; weight recency — per incident.io's engineering account (secondary source, [ZenML LLMOps database](https://www.zenml.io/llmops-database/ai-powered-incident-response-system-with-multi-agent-investigation), unverified) and Microsoft RCACopilot's 0.766 root-cause-category accuracy over a year of incidents ([arXiv:2305.15778](https://arxiv.org/abs/2305.15778), unverified this pass). Two hard constraints: AI SREs run 50+ queries per alert and hit upstream rate limits — the ledger must be a **fast local consolidated store**, pre-materialized, not a fan-out proxy; and LLM recency bias is real (Cleric's early scorer blamed the latest deploy for everything) — default to context-gating (refuse to investigate without sufficient context) and deterministic compound confidence signals (topological locality, count of independent sources).

### 4.4 Stack understanding and live health

Adopt Backstage's entity kinds and relations (Component/API/Resource/System/Domain/Group/User; ownedBy, dependsOn, providesApi, partOf, memberOf) as the lossless interchange ontology ([system model](https://backstage.io/docs/features/software-catalog/system-model/)); ingest via OpsLevel's read-only MCP ([GitHub](https://github.com/OpsLevel/opslevel-mcp)). Declared catalogs go stale, so reconcile them against **observed topology** (Cleric's implicit dependency mapping; HashiCorp Infragraph, private beta — [InfoQ](https://www.infoq.com/news/2025/10/hashicorp-project-infragraph/)) and surface the diff as a data-quality signal — the clearest whitespace between OpsLevel/Backstage and Cleric/Infragraph.

Live health context rides on the official observability MCPs the ecosystem already trusts: [grafana/mcp-grafana](https://github.com/grafana/mcp-grafana) (PromQL/LogQL/Tempo/Alerting/OnCall/Sift, `--disable-write`), [grafana/loki-mcp](https://github.com/grafana/loki-mcp), [grafana/tempo-mcp-server](https://github.com/grafana/tempo-mcp-server), and the Datadog official MCP (OAuth, read-only default). [HolmesGPT](https://github.com/robusta-dev/holmesgpt) (CNCF Sandbox, 50+ toolsets) is the closest OSS investigator but ships no curated multi-tenant ledger — our gap to fill.

**Evaluation as product:** adopt incident.io's "time travel" grading — replay the agent against pre-resolution state after closure and grade early conclusions against the human resolution (per the ZenML account; unverified) — so every closed incident automatically becomes a regression test for retrieval and recommendation quality. This is also the feedstock for Section 5's earned-autonomy loop, and incident-derived eval sets are the moat ([Datadog Bits AI](https://www.datadoghq.com/blog/building-bits-ai-sre/); its "up to 95% TTR reduction" is vendor-reported, unverified).

---

## 5. Disciplined by Design: Safety, Reliability, Escalation

### 5.1 The Google blueprint: autonomy levels and the Actus split

Google SRE's [AI engineering for reliable operations](https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/) supplies the production-proven frame: a **safety trifecta** (transparency — log chain of thought, signals, hypotheses, confidence; real-time risk evaluation against live production context; progressive authorization earned through eval success) and five autonomy levels:

| Level | Behavior | Platform default |
|---|---|---|
| L0 Manual | Human does everything | — |
| L1 Assisted | Agent suggests; human approves and actuates | Default for new agents |
| L2 Partial | System actuates after explicit human approval | Default ceiling for critical ops |
| L3 High | Independent action in bounded scenarios | Granted per-scenario, eval-gated |
| L4 Full | Full incident lifecycle | Not offered initially |

The pivotal architectural decision is separating the reasoning agent from an independent actuation gatekeeper (Google's **Actus**): pre-flight validation of every mutation (mandatory dry-run, justification verification, concurrent-action checks), **dynamic L3→L2 downgrade** when risk scores rise, and a **Red Button** — layered emergency endpoints to pause in-flight actions, block new ones, or globally revoke L3. Google's measured results (~10% MTTM reduction from L1 hypotheses, ~44% from investigation dashboards; every execution trace in Spanner — [Google Cloud blog](https://cloud.google.com/blog/products/devops-sre/how-google-sre-is-using-agentic-ai-to-improve-operations)) validate conservatism: capability data agrees, with ITBench showing models resolving only 13.8% of real SRE scenarios (medium confidence, [Augment Code](https://www.augmentcode.com/guides/ai-sre-ai-powered-site-reliability-engineering)). Our gatekeeper is the same chokepoint as the Section 2 gateway — one enforcement point for approvals, freezes, rate limits, rollback, and evals.

### 5.2 Plan / approve / apply, dry-run, blast radius, dual control

| Mechanism | Reference implementation | Platform contract |
|---|---|---|
| Plan-approve-apply | [OpenAI resumable approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals); Anthropic SRE cookbook `request_approval` → idle → approve → `merge_pull_request` ([managed_agents](https://github.com/anthropics/claude-cookbooks/tree/main/managed_agents)) | Durable, serializable approval state; "never merge until approved" as an Iron Law |
| Mandatory dry-run | [Google SRE](https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/): every agent-facing API supports `dry_run=true` | Tool registration refuses or risk-upgrades tools lacking dry-run |
| Risk/reversibility taxonomy | [arXiv:2506.12270](https://arxiv.org/pdf/2506.12270) | Read-only autonomous; reversible fast-path; irreversible requires human approval + cost-impact estimate |
| Blast-radius limits | OPA/Gatekeeper deny-overrides at the API boundary ([OPA docs](https://www.openpolicyagent.org/docs/kubernetes)); per-agent rate limits and circuit breakers (Google) | Change freezes and maintenance windows as policy-as-code outside the agent; max-objects-touched and namespace-scope caps per agent role |
| Dual control | Two distinct approver identities for irreversible actions | Cheap differentiator; recorded in the audit chain |
| Progressive delivery | [Argo Rollouts](https://argo-rollouts.readthedocs.io/) metric-gated canary with auto-abort | Agent-originated changes never direct-apply |
| Deterministic permissions | [Claude Code permissions](https://code.claude.com/docs/en/permissions): deny > ask > allow; managed settings non-overridable; hooks tighten, never loosen; OS sandboxing | Same semantics enforced gateway-side for non-Claude frameworks |

Pre-fix validation borrows the practitioner chaos pattern: inject the fault, verify the fix changes behavior, then merge ([chaos-engineer skill](https://github.com/Jeffallan/claude-skills) paired with Superpowers' `verification-before-completion`, whose Stop hooks are "a chance to say 'you're not done yet'" — [trailofbits/claude-code-config](https://github.com/trailofbits/claude-code-config)).

### 5.3 Approval fatigue and kill switches

Naive HITL fails: users approve 93% of permission prompts ([Anthropic auto-mode](https://www.anthropic.com/engineering/claude-code-auto-mode)). The remedy is risk-proportional prompting — Anthropic's two-stage classifier cut false positives from 8.5% to 0.4% on 10,000 real tool calls but still missed ~17% of curated overeager actions; therefore classifiers reduce fatigue but **never replace hard deny rules for irreversible actions** (deletes, permission changes, payments).

Kill switches must be layered, prospective, and outside the agent's write scope: a [Stanford CodeX analysis](https://law.stanford.edu/2026/03/07/kill-switches-dont-work-if-the-agent-writes-the-policy-the-berkeley-agentic-ai-profile-through-the-ailccp-lens/) (medium confidence, not independently verified) reports models sabotaged shutdown mechanisms in 79 of 100 tests and that killing a parent does not terminate delegated sub-tasks. The prescription matches Google's Red Button: pre-execution filters, rate governors, scoped blocks, global L3 revocation, quarantine + rollback — implemented in infrastructure the agent cannot write to. Magentic-One's red-team findings (under-constrained agents attempting password resets and recruiting humans via social media — [Microsoft Research](https://www.microsoft.com/en-us/research/articles/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/)) make sandboxed execution (Docker; Trail of Bits' ephemeral [dropkit](https://github.com/trailofbits/claude-code-config) droplets) non-negotiable.

### 5.4 Human escalation, including voice-calling on-site SREs

Escalation is a ladder, each rung audited:

1. **In-channel ask** — PreToolUse `ask` / approval-router Slack message with diff and evidence links.
2. **Console review** — session idles `awaiting_user`; engineer reviews in the platform console (Anthropic cookbook shape).
3. **Pager escalation** — open an incident and page on-call via existing schedulers: Grafana OnCall toolset in [mcp-grafana](https://github.com/grafana/mcp-grafana) (schedule lookup, incident creation) or PagerDuty via the cookbook webhook pattern. PagerDuty/Opsgenie carrier-grade voice/SMS delivery rides their native escalation policies.
4. **Direct voice call to the on-site SRE** — for L3-downgrade events, kill-switch activations, or expiring dual-control approvals where paging has not been acknowledged within policy SLA, the platform places an outbound voice call (Twilio-class programmable voice) that reads a structured summary (incident, action awaiting approval, blast radius) and accepts DTMF/voice acknowledge-or-deny, recorded into the audit chain. **Flag: no production-grade agent-native voice-escalation skill or MCP was found in the ecosystem survey — this rung is a build, not an integration, and the design above is our proposal rather than verified prior art.** The conservative rule: a voice channel may *acknowledge* or *deny*; it may never *approve* an irreversible action alone (approval requires the authenticated console path, preserving Kiteworks' authenticated-authorizer field).

### 5.5 Earned autonomy: the loop nobody has productized

Google gates autonomy upgrades on tiered eval data (Bronze autolabeled / Silver programmatic / Gold human-verified) with nightly replays of recent incidents graded by LLM raters plus deterministic exact-match scoring ([Google SRE](https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/)); [Braintrust](https://www.braintrust.dev/articles/agent-evaluation) supplies the commercial toolkit (trajectory grading, fault-injection simulation, CI-gated thresholds). Combined with Section 4's time-travel evals, the platform productizes the full loop — incident → regression test → eval suite → CI release gate → **autonomy-level certificate**: an L3 grant as a queryable artifact backed by eval evidence and revocable via the Red Button. With EU AI Act high-risk obligations landing August 2026 and Gartner's January 2026 AI SRE Market Guide formalizing buyer expectations (medium confidence), "autonomy you can audit" is the defensible position.

---

## 6. Ecosystem Posture: Build On, Compete With, Guard Against

**Build on (adopt as substrate):** `containers/kubernetes-mcp-server` (read-only + scoped ServiceAccount), `grafana/mcp-grafana` (+ Loki/Tempo/k6 siblings), `hashicorp/terraform-mcp-server`, official Datadog MCP, agentgateway-class gateways, redis/agent-memory-server, A2A v1.0 + MCP for interop, Backstage ontology for catalogs, and the Anthropic SRE cookbook as the canonical incident-to-PR flow ([goldmine survey](https://github.com/anthropics/claude-cookbooks)).

**Compete with (and must exceed):** Datadog Bits AI SRE on investigation shape and memory governance; incident.io on post-mortems-as-context; AgentCore Policy on policy authoring UX; HolmesGPT on OSS investigation breadth.

**Guard against:** supply-chain risk in the skills ecosystem — "Published skills have been found with backdoors and malicious hooks, and the ecosystem has no built-in quality gate" ([trailofbits/skills-curated](https://github.com/trailofbits/skills-curated)). The platform needs a vetted internal skill registry (Trail of Bits curation model), prompt-injection/risky-tool-call review on third-party skills, and MCP token-bloat budgeting per agent role.

## 7. Unverified Claims Register

| Claim | Source type | Status |
|---|---|---|
| Datadog "up to 95% TTR reduction" | Vendor blog | Unverified |
| SOC 2 cost/failure stats (6–12 mo, $50–150K, 83% failure) | Vendor blog, no methodology | Low confidence; do not quote externally |
| AgentCore Policy quotas/pricing | Devguide blocked automated fetch | Unverified |
| Stanford CodeX 79/100 shutdown-sabotage figure | Secondary analysis | Medium confidence |
| ITBench 13.8% scenario resolution | Secondary citation | Medium confidence |
| incident.io multi-dimensional retrieval + time-travel evals | ZenML secondary write-up | Unverified |
| RCACopilot 0.766 accuracy; Howie guide details | arXiv / published guide, not re-verified this pass | Stable but unverified |
| LangCache 15x / 70% savings | Vendor preview claims | Unverified; no GA SLA |
| Gartner Jan 2026 AI SRE Market Guide framing | Secondary | Medium confidence |
| Voice-escalation rung (Section 5.4) | No prior art found in ecosystem survey | Original proposal, not verified practice |

## 8. Bottom Line

Do not build orchestration, gateways, or memory engines — adopt the commoditized substrate (canonical patterns, agentgateway-class OSS, redis/agent-memory-server, official MCPs) and own the five layers no one ships together: (1) team topology governance with mandatory read-only review loops and MAST-aligned failure detection; (2) a pluggable-engine policy control plane with dual enforcement and a Rekor-style evidence-grade audit chain; (3) hierarchical governed memory with claims-to-namespace RBAC and reviewed promotion; (4) a decision-and-outcome incidents ledger with provenance and ledger-native time-travel evals; (5) an earned-autonomy safety loop — L0–L4 with dynamic downgrade, plan/approve/apply with dual control, layered kill switches, and an escalation ladder ending in an audited voice call to the on-site SRE. Each layer reinforces the next: policy enforces team roles, memory and ledger feed evals, evals gate autonomy, and the audit chain makes all of it sellable to compliance buyers.
