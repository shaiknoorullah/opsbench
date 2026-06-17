---
title: "Opsbench Platform — Integrations Catalog (Observability, ITSM, CRM & Customer Success, Comms, Cloud & On-Prem)"
date: 2026-06-12
status: research
branch: research/enterprise-agentops-platform
---

# Opsbench Platform — Integrations Catalog

## Executive Summary

This catalog enumerates the integration targets for the platform across five domains — observability, ITSM/ticketing, human escalation (chat/paging/voice), CRM and customer success, and cloud/on-prem resource connectivity — and resolves each to a concrete surface (MCP, REST/GraphQL, webhook, or streaming), a read/write contract, an auth model, and a launch tier.

Five conclusions structure everything below:

1. **MCP is the read front door; REST is the write path.** Every major observability and ITSM vendor now ships an official MCP server ([Datadog](https://docs.datadoghq.com/mcp_server/), [Grafana](https://github.com/grafana/mcp-grafana), [Linear](https://linear.app/docs/mcp), [PagerDuty](https://support.pagerduty.com/main/docs/pagerduty-mcp-server-integration-guide), [Salesforce](https://developer.salesforce.com/docs/ai/agentforce/guide/mcp.html)), but almost all are read-oriented. Writes — annotations, incident updates, alert provisioning, CS timeline entries — require per-vendor REST/GraphQL adapters governed by policy.
2. **The defensible layer is normalization, not connectors.** No vendor will build cross-vendor capability schemas (a normalized `query_metrics`, a unified agent-session abstraction, cross-system ticket-to-incident correlation, intersection-scoped multi-cloud credential minting) because each is incented toward lock-in. That gap is the product.
3. **Churn and quotas are structural.** Datadog's MCP endpoint is literally under `/api/unstable/`; Honeycomb archived its OSS server; Dynatrace deprecated its OSS server mid-2026; Atlassian's points-based rate limits land March 2026; agent-specific call caps and GB-scanned budgets already exist. Version every mapping, budget every call, pin nothing.
4. **Governance is the buying criterion.** ServiceNow AI Control Tower, Atlassian Rovo's supervised-to-autonomous graduation, Grafana's `--disable-write`, and Chronosphere's architecturally read-only MCP all signal the same enterprise expectation, which matches the practitioner ecosystem's universal advice: read-only first, scoped writes second, approval gates on anything dangerous ([k8slens MCP guide](https://medium.com/k8slens/18-best-devops-mcp-servers-for-2026-the-definitive-guide-bfde04654a35), [Anthropic SRE cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/managed_agents)).
5. **We must both consume and be consumed.** Vendors are racing to embed their MCPs inside other agents (Datadog inside [AWS DevOps Agent](https://aws.amazon.com/blogs/devops/accelerate-autonomous-incident-resolutions-using-the-datadog-mcp-server-and-aws-devops-agent-in-preview/) and [Azure SRE Agent](https://techcommunity.microsoft.com/blog/appsonazureblog/get-started-with-datadog-mcp-server-in-azure-sre-agent/4497123)); the platform should expose its own MCP server and run the same race.

Recommended launch tier (Section 8): Datadog + Grafana stack (observability), Linear + Jira + PagerDuty (ITSM/paging), Slack (chat), Salesforce + Zendesk SLA (customer context), AWS + Kubernetes (resources), plus our own outbound-only relay agent and OIDC token-exchange service for on-prem and multi-cloud reach.

---

## 1. Catalog Conventions

Each category table uses the columns: **vendor**, **surface** (MCP / REST / GraphQL / webhook / streaming), **what we read**, **what we write**, **auth model**, and **tier**:

- **Launch** — in the first GA release; sales-blocking if absent.
- **Fast-follow** — within two quarters of GA; demanded by a definable buyer segment.
- **Later** — opportunistic, partner-driven, or blocked on vendor GA.

All connectors ship behind a single connector framework that uniformly handles OAuth flows, static tokens, and header schemes across stdio/SSE/streamable-HTTP transports, with per-connection toolset filtering and a versioned capability mapping per vendor — the framework is the deliverable, individual connectors are configuration.

---

## 2. Enterprise Observability Integrations

MCP has become the de facto neutral *read* layer that OpenTelemetry never standardized: OTLP standardizes writes, but query languages remain fragmented (PromQL/LogQL/TraceQL vs. NRQL vs. DQL vs. SignalFlow vs. Datadog syntax). Vendor MCP servers bridge that gap for reads; write-back is REST/GraphQL per vendor.

| Vendor | Surface | What we read | What we write | Auth | Tier |
|---|---|---|---|---|---|
| Datadog | Hosted MCP (`mcp.datadoghq.com/api/unstable/...`, streamable HTTP) + REST (Events v2, Incidents, Monitors) + [Webhooks](https://docs.datadoghq.com/integrations/webhooks/) ingest | Metrics, logs, traces, monitors, incidents | Events, incident updates, monitor mutes (REST only — MCP is read-oriented by design) | OAuth login flow; API/app key fallback | Launch |
| Grafana (OSS + Cloud) | Self-hosted [mcp-grafana](https://github.com/grafana/mcp-grafana) (stdio/SSE/streamable HTTP) + [Annotations API](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/api-legacy/annotations/) + [Alerting Provisioning API](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/alerting_provisioning/) + Alertmanager webhooks ingest | Dashboards, PromQL/LogQL/Tempo, Incident, OnCall, Sift | Annotations, incidents, alert rules (Provisioning API only; `--disable-write` honored as default) | Service-account tokens; header forwarding | Launch |
| New Relic | OSS [mcp-server](https://github.com/newrelic/mcp-server) (thin) + [NerdGraph](https://docs.newrelic.com/docs/apis/nerdgraph/get-started/introduction-new-relic-nerdgraph/) GraphQL + workflow-destination webhooks | NRQL, entities, alert state | Deployment markers, alert config, change tracking (NerdGraph mutations — cleanest API of the set) | API key or OAuth 2.0 | Fast-follow |
| Dynatrace | Hosted Remote MCP (OSS server in Maintenance Mode — [dynatrace-mcp](https://github.com/dynatrace-oss/dynatrace-mcp)) | DQL (`execute_dql`), Davis analyzers, NL-to-DQL tools | `send_event`, notifications, notebooks — the one vendor with meaningful MCP writes | API token / platform auth | Fast-follow |
| Splunk Observability | Hosted MCP Gateway (streamable HTTP) ([docs](https://help.splunk.com/en/splunk-observability-cloud/splunk-ai-assistant/interact-with-your-observability-data-using-the-splunk-mcp-server)) | SignalFlow execution + NL-to-SignalFlow generation | None via MCP | `X-SF-REALM` + `X-SF-TOKEN` headers | Fast-follow |
| Honeycomb | Hosted-only MCP (OSS repo archived April 2026); Enterprise-tier-only | Queries, datasets | None (read-only) | API key | Later |
| Chronosphere | Hosted MCP + OSS Go self-host ([announcement](https://chronosphere.io/learn/announcing-the-chronosphere-mcp-server/)) | Metrics/logs/traces — "architecturally prevented" from mutations | None by design | Bearer token | Later |
| Prometheus/Loki/Tempo OSS stack | mcp-grafana datasource tools + Alertmanager webhook ingest | PromQL/LogQL/TraceQL | Silences via Alertmanager API | Per-deployment | Launch (via Grafana connector) |

**Design notes carried into engineering:**

- **Capability schema.** Normalized operations (`query_metrics`, `search_logs`, `get_trace`, `list_incidents`) map onto heterogeneous vendor tools — Datadog's `get_metrics`, Grafana's per-datasource tools, Dynatrace's `execute_dql`, Splunk's `execute_signalflow_program`, NRQL via NerdGraph. Route NL-to-query to native vendor generators first (Dynatrace `generate_dql_from_natural_language`, Splunk `generate_signalflow_program`), falling back to our own generation.
- **Quota and audit as managed resources.** Datadog caps the MCP at 50 requests/10s and 50,000 tool calls/month with per-call Audit Trail logging (120-day retention); Dynatrace meters Grail by GB scanned (`DT_GRAIL_QUERY_BUDGET_GB`, default 1000 GB/session). Aggregate these into cross-vendor agent-query budgeting, caching, and audit dashboards — a differentiator no single vendor can offer.
- **Plan/region gating in the catalog model.** Honeycomb MCP is Enterprise-only; Datadog MCP excludes GovCloud; Splunk's gateway excludes GCP and GovCloud realms. Regulated customers get REST fallbacks, modeled explicitly per connector.
- **Vendor-side telemetry disclosure.** Dynatrace BizEvents are on by default and Datadog logs user identity per MCP call — both go into our data-flow documentation to pre-empt customer privacy reviews.
- **Self-instrumentation.** Our agents emit [OTel GenAI semantic conventions](https://opentelemetry.io/blog/2026/genai-observability/) (`invoke_agent` → `chat` → `execute_tool` spans, `gen_ai.*` attributes, the two standard token/duration metrics) over plain OTLP into the customer's existing backend — no proprietary SDK. The conventions are explicitly unstable; the mapping layer is versioned.
- **Ecosystem context.** The practitioner ecosystem already treats [grafana/mcp-grafana](https://github.com/grafana/mcp-grafana) as "the flagship observability MCP" and has produced a half-dozen community Datadog MCPs (e.g., `us-all/datadog-mcp-server` with 159 tools and a search-tools meta-tool) per the [devops-agent-skills survey](/home/devsupreme/work/opsbench/docs/superpowers/research/2026-06-12-devops-agent-skills-tools.md). We consume official servers, learn token-efficiency tricks from the community ones, and avoid the documented MCP-token-bloat trap — "the GitHub MCP alone eats 46,000 tokens across 91 tools" ([Pulumi 2026](https://www.pulumi.com/blog/top-8-claude-skills-devops-2026/)) — via per-connection toolset filtering.

---

## 3. ITSM & Ticketing Integrations

Two complementary channels: MCP as the front door for agent-initiated actions, webhooks as the nervous system for real-time events. MCP is pull-only; bidirectional sync demands per-vendor webhook ingestion of wildly uneven quality.

| Vendor | Surface | What we read | What we write | Auth | Tier |
|---|---|---|---|---|---|
| Linear | Hosted MCP (`mcp.linear.app/mcp`, GA) + GraphQL + AgentSession webhooks ([agent-interaction docs](https://linear.app/developers/agent-interaction)) | Issues, projects, comments, `promptContext` payloads | Issues, comments, AgentActivities (thought/elicitation/action/response/error), Agent Plans | OAuth 2.1 + dynamic client registration | Launch |
| Jira / JSM (Atlassian) | REST + webhooks (official MCP via Rovo ecosystem) | Issues, requests, change records | Issues, transitions, comments, change records | OAuth 2.0 (3LO) / API token | Launch |
| ServiceNow | MCP via AI Control Tower / Action Fabric (GA Knowledge 2026) + Table/Change APIs ([press release](https://newsroom.servicenow.com/press-releases/details/2026/ServiceNow-opens-its-full-system-of-action-to-every-AI-Agent-in-the-enterprise/default.aspx)) | Incidents, changes, CMDB, approvals | Governed flows, playbooks, catalog requests, Change Models (headless actions consume Assists — metered) | OAuth/session via Control Tower | Fast-follow |
| PagerDuty | Hosted MCP (`mcp.pagerduty.com/mcp`, US/EU, GA) + Events API v2 + REST + V3 webhooks | Incidents, services, on-call (`GET /oncalls`) | Incidents, notes, escalations, schedule updates | User API token (Advanced Permissions; Professional plan+) | Launch |
| Zendesk | REST + webhooks now; MCP Server EA summer 2026 ([Relate 2026](https://www.zendesk.com/newsroom/press-releases/relate-2026/)) | Tickets, [SLA policies](https://developer.zendesk.com/api-reference/ticketing/business-rules/sla_policies/) and metric state | Tickets, comments, tags | OAuth / API token | Fast-follow (MCP post-GA) |
| Freshservice | REST + manually configured Workflow Automator webhooks | Tickets, assets, changes | Tickets, notes | API key (global account-level — least-privilege caveat) | Later |
| Intercom | Hosted MCP (`mcp.intercom.com/mcp`, US-hosted workspaces only) + REST fallback for EU/AU ([docs](https://developers.intercom.com/docs/guides/mcp)) | Conversations, contacts, companies, articles | Conversation replies, notes | OAuth or Bearer | Later |

**Linear is the reference model.** Its AgentSession/AgentActivity primitive — six lifecycle states, five typed agent-emittable activities with server-side validation, webhooks carrying pre-formatted `promptContext`, and hard 5s-webhook / 10s-first-activity deadlines — is the most complete agents-as-teammates model in any ticketing tool. We implement it natively *and* replicate it as an abstraction over Jira, ServiceNow, Zendesk, and Freshservice, where no equivalent exists. That unified session layer is the core differentiator, and the latency budget mandates an always-on ingestion tier that acknowledges instantly and defers agent work to a queue.

**Hard constraints to architect around:**

- **Atlassian points-based limits (from March 2, 2026):** 65,000 points/hour shared globally per app, hard 429 lockout for the remainder of the hour on exhaustion ([Atlassian docs](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)). Polling is structurally unviable; webhook-driven delta sync with point budgeting is mandatory.
- **Freshservice:** plan-tiered caps (100–500 req/min account-wide), failed calls consume quota, no programmatic webhook registration — onboarding must walk admins through manual Workflow Automator setup.
- **Bidirectional sync** follows the proven [Exalate](https://exalate.com/blog/jira-servicenow-integration-examples/)/Unito pattern: provenance-tagged changes to prevent loops, independent per-side mapping, downtime queueing, explicit conflict rules.
- **Change approvals route through native ITSM objects:** Standard (pre-approved) ServiceNow changes auto-approve; Normal changes with computed Moderate/High risk trigger CAB approvals — the agent assembles risk evidence, humans sign off ([ServiceNow community](https://www.servicenow.com/community/in-other-news/using-change-approval-policies/ba-p/2286835)). This mirrors the canonical approval-gate pattern from the [Anthropic SRE cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/managed_agents): "Never call merge_pull_request unless request_approval returned 'approved'."
- **Governance is the buying criterion.** ServiceNow's [AI Control Tower](https://www.theregister.com/2026/05/05/servicenow_clears_agents_for_landing/) discovers, governs, and kill-switches any agent in the enterprise (built on Veza's 30B-permission access graph and Traceloop tracing); Atlassian Rovo makes autonomy opt-in per request type with supervised-to-autonomous graduation. We register our agents into these inventories rather than fighting them, and we meter vendor consumption pricing (ServiceNow Assists, Zendesk per-resolution charges) our agents incur, surfacing it to customers.
- **Market timing.** Opsgenie's shutdown (data deletion April 5, 2027 — [Atlassian](https://www.atlassian.com/software/opsgenie/migration)) is re-platforming thousands of teams toward PagerDuty and incident.io; migration tooling through that window is a wedge. Anthropic is the first design partner for ServiceNow Action Fabric, validating the MCP-into-system-of-action route.

---

## 4. Human Escalation: Chat, Paging, and Voice

When an agent exhausts remediation options it must hand off to a human with proof of receipt. Four layers; the escalation-ladder state machine lives in our platform, never in a vendor.

| Target | Surface | What we read | What we write | Auth | Tier |
|---|---|---|---|---|---|
| PagerDuty | Events API v2 (`/v2/enqueue`) + REST + MCP + webhooks | On-call resolution, incident state, ack events | trigger/acknowledge/resolve with persisted `dedup_key`; notes | Integration routing keys + API token | Launch |
| Slack | Web API (`chat.postMessage` + Block Kit) + interaction webhooks ([docs](https://docs.slack.dev/messaging/creating-interactive-messages/)) | Channel history, ack button presses | Interactive incident messages, per-incident channels, `/pd`-style slash commands | Bot token, OAuth scopes | Launch |
| Microsoft Teams | Workflow bot: Adaptive Cards `Action.Execute` + `ReplaceForAll`, `refresh.userIds` ([Teams docs](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/conversations/workflow-bot-in-teams)) | Ack verbs | Incident cards with shared "Acked by X" state | Entra app registration | Fast-follow |
| Twilio (voice/SMS) | TwiML `Say`/`Gather` (DTMF floor) → [ConversationRelay](https://webrtc.ventures/2025/05/twilios-conversationrelay-ga-release-brings-voice-ai-to-the-enterprise-mainstream/) (conversational, $0.07/min relay) | Keypress acks, spoken acknowledgments, transcripts | Outbound calls summarizing incidents; SMS (A2P 10DLC-gated) | Account SID + auth token | Launch (DTMF), Fast-follow (conversational) |
| Retell AI (buy-path alternative) | Hosted voice-agent API ([pricing](https://www.retellai.com/pricing)) | Call outcomes, transcripts | Outbound AI calls ($0.07–0.31/min all-in; SOC 2 + HIPAA) | API key | Later (evaluate vs. build) |
| Zoom | Server-to-Server OAuth REST ([docs](https://developers.zoom.us/docs/internal-apps/s2s-oauth/)) | Meeting state | Headless war-room bridge creation, attached to incident record | S2S OAuth (`account_credentials`, 1-hr tokens) | Fast-follow |
| incident.io / Rootly / Grafana IRM | REST + webhooks behind the same pager abstraction | Incident state | Incident create/update | API tokens | Fast-follow |

**Engineering doctrine for this domain:**

- **One escalation state machine.** Timeouts, repeats, and acks from any channel — Slack button, Teams card, DTMF keypress, spoken "I've got it" — converge on a single source of truth; PagerDuty/Slack/Twilio are interchangeable delivery channels.
- **Total-escalation-failure watchdog.** After its last policy repeat, PagerDuty silently sticks the incident to the final responder with no further notifications ([escalation policies docs](https://support.pagerduty.com/main/docs/escalation-policies)); no vendor reports "nobody ever answered." We detect never-acked incidents and trigger fallback paths (voice, secondary vendor, exec page).
- **Events API discipline:** four severity values only (`critical`/`error`/`warning`/`info`), 512 KB payload cap (truncate and link out), ~120 events/min per routing key with queued backoff, and `dedup_key` persisted as first-class agent state so the agent can idempotently re-fire and resolve its own alerts.
- **Capability-probe per account.** PagerDuty tiering gates one-touch-to-join (Business+) and workflow conditionals (Enterprise); Free is capped at 1 escalation policy. (An earlier reading that paid plans cap policies was refuted on fact-check — 50 is the per-rule *target* limit, not a policy cap.) Degrade gracefully.
- **Chat ack handlers are queue-based**, returning inside Slack's ~3-second interaction window and cancelling escalation timers asynchronously.
- **Voice-first for the US; SMS as a managed onboarding flow.** A2P 10DLC brand registration ($4.50–$46 plus $15 campaign vetting — [Twilio pricing](https://help.twilio.com/articles/1260803965530-What-pricing-and-fees-are-associated-with-the-A2P-10DLC-service-)) and multi-day vetting (reported ~5 business days; *not primary-source confirmed*) make per-customer SMS a funnel risk; platform-owned ISV registration mitigates. ConversationRelay does not manage conversation history — we track barge-in-truncated utterances ourselves. The Deepgram nova-3 default-STT claim is *low-confidence/unverified*. The MIT-licensed [rbarazi/twilio-voice-agent](https://github.com/rbarazi/twilio-voice-agent) is a verified build reference (Media Streams + OpenAI Realtime, outbound calls, `end_call` tool, G.711↔PCM16 conversion).
- **Close the loop the pagers don't:** auto-create the Zoom bridge headlessly, attach it to the incident, and offer join-by-keypress during the agent's own outbound calls (copying PagerDuty's dial-in-with-PIN-pause pattern, `415-555-1212,,,,1234#`).

---

## 5. CRM & Customer Success Context Integrations

CRM/CS integrations convert "what broke" into "who is hurt and how much it matters." Everything needed — account attachment, CSM identification, SLA-contract awareness, health-score context, incident write-back — is buildable on documented APIs today; the burden is rate-limit asymmetry (~two orders of magnitude between support tools and CS platforms) and auth heterogeneity.

| Vendor | Surface | What we read | What we write | Auth | Tier |
|---|---|---|---|---|---|
| Salesforce | Hosted MCP (GA — [Agentforce MCP guide](https://developer.salesforce.com/docs/ai/agentforce/guide/mcp.html)) + REST/SOQL + **Pub/Sub API streaming** (gRPC, replay-id) | Accounts, Cases, Opportunities, Entitlements/Milestones (Success/Warning/Violation states — [guide](https://www.salesforceben.com/complete-guide-to-salesforce-entitlements-and-milestones-in-service-cloud/)) | Cases, Chatter posts, custom incident objects | OAuth (JWT bearer); MCP handles permissions server-side | Launch |
| Zendesk (SLA context) | REST ([SLA API](https://developer.zendesk.com/api-reference/ticketing/business-rules/sla_policies/), admin-only, Professional/Growth+) | SLA policies + seven breach metrics | — (write side covered in Section 3) | OAuth / API token | Launch |
| HubSpot | REST + webhooks (up to 1,000 subscriptions/app) ([limits](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines)) | Companies, deals, tickets | Custom events (30M completions/mo; 1,250 req/s send endpoint), timeline entries | Private-app tokens or OAuth (100–190 req/10s) | Fast-follow |
| Dynamics 365 (Dataverse) | Web API + change tracking ([service-protection limits](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/api-limits)) | Accounts, cases, entitlements | Cases, annotations | Entra service principal (same 6,000 req/300s limits as humans; honor Retry-After; search capped at 1 req/s) | Fast-follow |
| Gainsight NXT | REST (bulk async 10/hr) ([limits](https://support.gainsight.com/gainsight_nxt/Administration_and_Permissions/General_Administration/Gainsight_CS_System_Limits)) | Health scores, CTAs, Renewal Center | Timeline entries (closed-loop write-back) | Non-expiring `accesskey` header — **flag in customer security reviews**; fixed-window details *not independently re-verified* | Fast-follow |
| Planhat | REST + first-party MCP ([developer portal](https://www.planhat.com/developers)) | Accounts, health, usage | Notes/activities | API token | Later |
| Vitally | REST (1,000 req/min token bucket; writes count multiple) ([docs](https://docs.vitally.io/pushing-data-to-vitally/rest-api)) | Accounts, health scores | Notes (first-class CRUD) | Basic auth (API key as username) | Later |
| ChurnZero | REST (progressive-delay throttling) | Churn scores (*medium confidence*) | Activities | Basic auth (username + API key) | Later |
| Totango | REST (~100 calls global — **low confidence/unverified**; confirm at scoping) | Accounts, health | Touchpoints | App-token header | Later |

**How incident-to-affected-customer mapping works:** per-vendor ingestion adapters normalize into an internal "affected account" graph — account, ARR, tier, health score, CSM, entitlements, open deals — keyed by the services each account consumes. Service→account impact mapping is driven by Salesforce Entitlement/Asset/Service Contract relations rather than manual account lists, which is the step beyond the [incident.io baseline](https://docs.incident.io/articles/2469571386-salesforce-integration) (account attachment, CSM auto-add, revenue-aware leadership notification, opportunity flagging, 50k-account read-only OAuth sync) that buyers treat as table stakes.

**How ARR/SLA-aware prioritization works:** SLA state is read directly, not inferred — Salesforce Milestones fire structured Warning (violation imminent) and Violation (deadline exceeded) stages with business-hours-aware clocks; Zendesk exposes per-priority targets across seven metrics (First Reply through Total Resolution Time). Incident ranking weights live contractual breach risk by cached ARR and tier. This is an integration problem, not an inference problem.

**Architecture mandates:** one streaming hub per Salesforce org (Pub/Sub API over gRPC with replay-id recovery; per-incident or per-agent subscriptions would exhaust the shared 25k–50k/day event allocation and the 200-managed-subscription cap within hours — [limits](https://developer.salesforce.com/docs/platform/pub-sub-api/guide/allocations.html)); a rate-budgeted sync layer with per-vendor token buckets treating CS platforms as the bottleneck tier; health scores and ARR served from an eventually-consistent cache, never live lookups mid-incident; write-back as queued idempotent jobs; Vault-managed auth heterogeneity; and scoped read-only OAuth, per-field sync controls, and audit logging of every CRM read an agent performs — procurement requirements, not optional hardening.

---

## 6. Cloud & On-Prem Resource Connectivity

The industry doctrine is settled: no long-lived credentials anywhere, identity by federation, access brokered through outbound-only relays, every action attributable to both the agent and the human it acts for. The relay and the MCP gateway are commoditizing; the open territory is the credential plane underneath.

### 6.1 Cloud targets

| Target | Surface | What we read | What we write | Auth | Tier |
|---|---|---|---|---|---|
| AWS | STS federation (`AssumeRoleWithWebIdentity`; [IAM Roles Anywhere](https://aws.amazon.com/about-aws/whats-new/2024/03/iam-roles-anywhere-credentials-valid-12-hours/) for on-prem X.509) + service APIs + official AWS MCP suite | Resource state, CloudWatch, Cost Explorer | Scoped change operations under per-task session policies | OIDC token exchange; session tags (`AccessType=AI`) per the [AWS agent-access pattern](https://aws.amazon.com/blogs/security/secure-ai-agent-access-patterns-to-aws-resources-using-model-context-protocol/) | Launch |
| GCP | [Workload Identity Federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation) (RFC 8693; OIDC/SAML/AWS/X.509 inputs) + service APIs | Resource state, monitoring | Scoped changes via impersonated service accounts | WIF + `roles/iam.workloadIdentityUser`; 1-hr default token, 127-char subject, CEL mappings | Fast-follow |
| Azure | Entra federated credentials on app registrations + ARM APIs + Azure MCPs | Resource state, Monitor | Scoped changes | Entra OIDC federation | Fast-follow |
| Kubernetes | [containers/kubernetes-mcp-server](https://github.com/containers/kubernetes-mcp-server) (native Go, multi-cluster, `--read-only`) + direct API via curated ServiceAccounts | Workloads, events, logs | Curated verb/resource matrix only | Per-cluster SA tokens or cloud-federated identity | Launch |
| Terraform/IaC | [hashicorp/terraform-mcp-server](https://github.com/hashicorp/terraform-mcp-server) (registry, HCP workspace CRUD; destructive ops opt-in via `ENABLE_TF_OPERATIONS`) | Module/provider docs, workspace state | Plan/apply behind approval gates | TFE token | Fast-follow |
| Vault | JWT auth via the [HashiCorp validated AI-agent identity pattern](https://developer.hashicorp.com/validated-patterns/vault/ai-agent-identity-with-hashicorp-vault) | — | Dynamic per-request DB credentials (TTL leases), preferred over static rotation | OAuth On-Behalf-Of / RFC 8693 into JWT auth; `bound_audiences`/`bound_claims` pinning | Launch (as internal credential plane) |

**The Kubernetes "read-only" trap** (per [official RBAC good practices](https://kubernetes.io/docs/concepts/security/rbac-good-practices/)): `list`/`watch` on Secrets returns full secret values; `nodes/proxy` with mere `get` enables command execution on every pod on the node while bypassing audit; `escalate`/`bind`/`impersonate`, `serviceaccounts/token` create, and CSR approval rights are all escalation vectors. Our K8s connector ships a curated verb/resource matrix plus response-side redaction — never raw customer RBAC trust.

**The AWS pattern is the template for all clouds:** dedicated role per agent, session policy per tool invocation, effective permissions = intersection of both; managed MCP condition keys (`aws:ViaAWSMCPService`, `aws:CalledViaAWSMCP`) let org SCPs treat agent traffic distinctly. The caveat AWS itself states: all of it evaporates if the agent shells out to the CLI with ambient credentials — so agent sandboxes are denied ambient credentials *by construction*, and every cloud call goes through the brokered path. Nobody composes intersection-scoped per-task minting across all three clouds; that token-exchange service is unclaimed territory, as is structural dual-credential separation (observer agents get read-only federated identities; changes require a distinct JIT credential plus approval).

### 6.2 On-prem connectivity patterns

| Pattern | Model | Constraint | Our posture |
|---|---|---|---|
| [Boundary multi-hop](https://developer.hashicorp.com/boundary/docs/workers/multi-hop) | Egress workers reverse-proxy outbound; no inbound rules | HCP/Enterprise only — not OSS | Accept as federation input where deployed; don't depend on it |
| [cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/) | Outbound-only; 4 connections across ≥2 DCs; up to 25 replicas | SaaS control plane; no air-gap story | Same |
| Teleport reverse tunnels / [tbot](https://goteleport.com/platform/machine-and-workload-identity/) | Agent joins via token/cloud metadata; renews SPIFFE-compatible X.509/JWT | Open core | Design template for our own relay; partner where installed |
| [SSM Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html) | No inbound ports/bastions/keys; IAM-governed, S3/CloudWatch logging | On-prem sessions require paid advanced-instances tier | AWS-native option, not the universal answer |
| [Tailscale Grants](https://tailscale.com/blog/grants-ga) / tsnet | Embedded app reads grant-carried capabilities | SaaS control plane (Headscale for self-host) | Candidate embedding for our relay |

The audit bar is Teleport's: identity, tool, parameters, response, timestamps, and outcome *including denials with reason* ([Teleport MCP access](https://goteleport.com/blog/secure-ai-agents-zero-code-mcp/)). The MCP gateway layer (deny-by-default, glob/regex tool allowlists, six-IdP registries like [mcp-gateway-registry](https://github.com/agentic-community/mcp-gateway-registry)) is table stakes, not a differentiator. Practitioner doctrine reinforces self-hosting: "With self-hosted MCP, a jailbreak can only access what YOUR security policies allow" ([Cloudshipai guide](https://www.cloudshipai.com/blog/mcp-servers-devops-complete-guide-2026)), and never put MCP servers on the public internet ([Fly.io](https://fly.io/docs/mcp/access-control/flycast/)).

---

## 7. Ecosystem Position: Build On, Compete With, Be Embedded In

The practitioner corpus ([devops](/home/devsupreme/work/opsbench/docs/superpowers/research/2026-06-12-devops-agent-skills-tools.md), [security/networking](/home/devsupreme/work/opsbench/docs/superpowers/research/2026-06-12-security-networking-agent-skills-tools.md), [patterns](/home/devsupreme/work/opsbench/docs/superpowers/research/2026-06-12-agentic-patterns-workflows.md), [goldmines](/home/devsupreme/work/opsbench/docs/superpowers/research/2026-06-12-goldmine-repositories.md)) maps what already exists and what we adopt versus build:

- **Adopt as connectors:** `grafana/mcp-grafana`, `containers/kubernetes-mcp-server`, `hashicorp/terraform-mcp-server`, GitHub MCP, official AWS/Azure MCP suites — the production-vetted tier of the ecosystem.
- **Adopt as patterns:** the orchestrator-executor-reviewer split (orchestrator with minimal tools, read-only reviewers as distinct passes); read-only-first credential discipline (`--disable-write`, `--read-only` as defaults graduated per environment); the PagerDuty-webhook → investigate → PR → `request_approval` → merge loop from the [Anthropic SRE cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/03_The_site_reliability_agent.ipynb); runbooks-as-skills; and skill/tool curation against the documented supply-chain risk ("Published skills have been found with backdoors and malicious hooks" — [trailofbits/skills-curated](https://github.com/trailofbits/skills-curated)).
- **Compete on:** everything single vendors are structurally disincented to build — cross-vendor capability schemas, the unified agent-session layer, cross-vendor query-spend budgeting, the multi-cloud credential plane, and cross-domain attribution.
- **Be embeddable:** expose our own MCP server so the platform sits inside Claude, Copilot, AWS DevOps Agent, Azure SRE Agent, and ServiceNow Action Fabric — the same race every vendor is running.

---

## 8. Recommended Launch-Tier Integration Set

| Domain | Launch integrations | Rationale |
|---|---|---|
| Observability | Datadog (MCP read + REST write + webhook ingest), Grafana/Prometheus/Loki/Tempo (mcp-grafana + Provisioning API + Alertmanager ingest) | Covers the dominant commercial vendor and the OSS stack; both have mature, governable surfaces |
| ITSM | Linear (native AgentSessions), Jira/JSM (webhook-driven delta sync under the points regime), PagerDuty (Events v2 + MCP + webhooks) | Linear sets the agent-UX bar; Jira is ubiquitous; PagerDuty anchors paging and rides the Opsgenie migration wave |
| Escalation | Slack interactive messages; Twilio DTMF voice (TwiML Say/Gather) | The reliability floor for ack-from-anywhere; conversational voice (ConversationRelay) and Teams/Zoom follow fast |
| Customer context | Salesforce (hosted MCP + one Pub/Sub hub per org + Entitlements/Milestones), Zendesk SLA read | Delivers ARR/SLA-aware prioritization and the incident.io-baseline features at GA |
| Resources | AWS (token exchange + session policies + agent tagging), Kubernetes (curated-matrix connector), Vault (internal credential plane) | The most-documented cloud pattern plus the universal substrate; GCP/Azure federation fast-follows on the same exchange service |
| Platform surfaces | Our own MCP server; OTel GenAI telemetry over OTLP | Embeddability and bring-your-own-backend observability from day one |

Fast-follow: New Relic, Dynatrace, Splunk Observability; ServiceNow (Action Fabric/Control Tower); Zendesk write + MCP post-GA; Teams, Zoom bridges, conversational voice, incident.io/Rootly/Grafana IRM; HubSpot, Dynamics 365, Gainsight; GCP and Azure federation; Terraform write path. Later: Honeycomb, Chronosphere, Freshservice, Intercom (with EU REST fallback), Planhat/Vitally/ChurnZero/Totango, Retell evaluation.

---

## 9. On-Prem Connectivity Architecture (Recommendation)

1. **Relay agent (ours, tbot-class).** A single static binary customers run inside their network: outbound-only (443) to our control plane, joinable via one-time token or cloud instance metadata, holding a continuously renewed SPIFFE-compatible X.509/JWT workload identity. No inbound ports, no bastions, no SSH keys. Embedding tsnet/WireGuard is the candidate transport; we do not depend on Boundary Enterprise or SSM advanced-instances pricing.
2. **Token-exchange service (the credential plane).** The platform is an OIDC issuer trusted by AWS (`AssumeRoleWithWebIdentity` / Roles Anywhere), GCP (WIF), Azure (Entra federated credentials), and Vault (JWT auth). Every task gets intersection-scoped, short-lived credentials minted per invocation; read identities and write identities are structurally distinct, with writes requiring JIT issuance plus an approval gate.
3. **Attribution threading.** Agent ID, task ID, and on-behalf-of user stamped on every downstream action — STS session tags, WIF attribute mappings, Vault entity metadata, DB username templating — threaded by an `X-Correlation-ID` through a unified audit trail that records denials with reasons.
4. **Sandbox enforcement.** Agent runtimes have no ambient credentials by construction; all cloud, K8s, and database calls traverse the broker. MCP tool allowlisting at the gateway is implemented but treated as table stakes.
5. **Air-gapped tier.** Fully self-hostable control plane, private CA, and local relay rendezvous; SaaS-controlled relays (cloudflared, Tailscale's hosted plane) are disqualified for this tier without Headscale-style self-hosting.
6. **Partner posture.** Where customers already run Teleport or Boundary, we accept their identities as federation inputs to the token-exchange service rather than competing on the relay.

---

## Appendix: Explicitly Flagged Unverified / Low-Confidence Claims

| Claim | Status |
|---|---|
| Totango global rate limit (~100 calls) | Low confidence — confirm during integration scoping |
| Gainsight fixed-window limit details and never-expiring key behavior | Plausible, not independently re-verified |
| ChurnZero churn-score endpoint coverage | Medium confidence |
| Opsgenie "October 2025 JSM-bundled access end" intermediate date | Secondary sources only; the April 5, 2027 deletion date is verified |
| A2P 10DLC approval timelines (~5 business days; 10–15 in spikes) | Reported, not primary-source confirmed |
| Deepgram nova-3 as Twilio default STT for new accounts | Reported, low confidence |
| OTel GenAI semantic conventions | Explicitly unstable per the spec; mapping layer must be versioned |
| Datadog MCP endpoint stability | Vendor-labeled `unstable`; setup-doc URLs have already moved — treat all vendor MCP URLs as churn-prone |
