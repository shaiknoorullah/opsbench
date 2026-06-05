# F6 — sympozium architectural evaluation

**Status:** draft 2026-06-04 — awaiting reviewer approval
**Author:** Claude Code session (Shaik Noorullah, driver)
**Parent roadmap:** [`./2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md) — F6 section, item 2
**Inputs:**

- [`../research/2026-06-04-ecosystem-catalog.md`](../research/2026-06-04-ecosystem-catalog.md) — surfaced `sympozium-ai/sympozium` as a Kubernetes-native multi-agent coordination layer authored by the `k8sgpt` maintainer.
- [`./2026-06-04-f1-design.md`](./2026-06-04-f1-design.md) — Cedar policy generator; the artifact sympozium would consume if we adopt option C.
- [`./2026-06-04-f2-design.md`](./2026-06-04-f2-design.md) — opsbench-gateway (Cedar-evaluated MCP proxy); load-bearing overlap with sympozium's MCP server integration.
- [`./2026-06-04-f3-design.md`](./2026-06-04-f3-design.md) — Ed25519 signed receipts; sympozium's shared SQLite workflow memory is where these receipts would persist in a K8s deployment.

## 1. What is sympozium?

`sympozium-ai/sympozium` is a Kubernetes-native multi-agent coordination layer built by Alex Jones (also the author of `k8sgpt`). It is MIT-licensed, sits at ~519+ GitHub stars as of the catalog snapshot, and is under active development. Sympozium does not try to be a model runtime — instead it treats agents as Kubernetes workloads and provides the orchestration primitives needed to make a multi-agent topology safe, observable, and policy-bounded. Concretely it ships:

- A **synthetic membrane** controller that mediates which agents can see which other agents, what tools they can call, and what channels they can read/write. The membrane is reconciled from CRDs the same way standard Kubernetes resources are.
- **Shared workflow memory** backed by an embedded SQLite store, mounted into each agent pod and used as the canonical hand-off surface between agents within a workflow.
- **Ephemeral RBAC skill sidecars** — a skill is shipped as a sidecar container with a scoped Kubernetes ServiceAccount whose RBAC binding is created at workflow start and torn down at workflow end. Each tool invocation runs against the sidecar's RBAC, not the agent's.
- **Agent sandboxing** via gVisor or Kata containers, so a compromised agent cannot escape into the node kernel.
- **MCP server integration** so an agent's tool surface can include any MCP-speaking upstream (vendor MCPs, opsbench recipes, etc.) routed through the membrane.
- **Multi-channel handoff support** for Telegram, Slack, and Discord, so a workflow can span chat surfaces and an agent can be reached on whichever channel its membrane allows.
- A **Helm-chart + CRD distribution model**: the operator, the membrane controller, the workflow CRDs, and the skill-sidecar templates all install via `helm install sympozium`.

The headline architectural claim is that the membrane + shared memory + ephemeral RBAC together make multi-agent topologies *operable in production* on Kubernetes — i.e. an operator can answer "what did agent A see?" and "what did skill X actually have permission to do at 14:03?" by reading CRDs and the workflow-memory SQLite, not by tailing logs.

### 1.1 Provenance check

Sympozium is on the F-series radar because its author also maintains `k8sgpt`, which appears in the catalog as a vendor-credible MCP recipe target (F0). The same maintainer shipping both a curated MCP (`k8sgpt`) and a K8s multi-agent layer (`sympozium`) is a useful signal: the architectural choices made in sympozium are likely to be sympathetic to the kinds of MCP traffic opsbench plans to route. That doesn't make sympozium a perfect fit on its own — we still evaluate it against opsbench's identity below — but it does explain why we treat it as a higher-priority adjacency than several other K8s agent runtimes we could have catalogued instead.

### 1.2 What sympozium is not

For the evaluation to be honest about what we are comparing, the following negatives are also relevant:

- Sympozium is **not a single-host runtime**. There is no documented "run sympozium on my laptop with no cluster" mode. Minikube/Kind work for development, but the deployment shape is Kubernetes regardless.
- Sympozium is **not a model runtime**. It does not load LLM weights, manage GPU pools, or host inference endpoints. It coordinates agents that already exist as containers; the model lives in the container or behind an API the container calls.
- Sympozium is **not a Cedar-aware system**. The policy primitive is Kubernetes RBAC, not an external policy language. Adopting Cedar would require either an extension hook in the membrane controller or a sidecar gateway that evaluates Cedar before the membrane sees the request.
- Sympozium is **not pre-1.0 stable**. CRDs and Helm-chart values are subject to change. Any opsbench integration must accept a pinning + sync overhead similar to what F2 commits to for `stacklok/toolhive`.

These constraints shape the recommendation in §4: they explain why a tight coupling (Option B) is costly relative to a loose, deployment-mode-level coupling (Option C).

## 2. How does it overlap with opsbench?

The overlap is real and load-bearing. Below, each row names the sympozium primitive on the left and the opsbench equivalent on the right.

### 2.1 Skill sidecars with ephemeral RBAC ≈ opsbench Cedar policies

Sympozium binds a per-skill ServiceAccount with a narrow RoleBinding for the lifetime of a workflow invocation. The RoleBinding lists the Kubernetes verbs the skill is allowed to perform; the membrane enforces that the skill can only emit MCP calls whose effect (Pod read, Secret read, ConfigMap write, etc.) maps to a verb in that RoleBinding. The grant is ephemeral — when the workflow ends, the RoleBinding is deleted.

opsbench, in the F1/F2 design, achieves the same outcome via a different mechanism. Each opsbench skill ships with a `tools.cedar` policy that names the exact MCP tools that skill is allowed to invoke; the F2 `opsbench-gateway` evaluates each tool call against the merged Cedar policy and rejects anything not in the explicit `Allow` set. The ephemeral-ness is not Kubernetes-RBAC ephemeral — it is *recipe-static + agent-class-static*: a Cedar `principal` is the agent class, the policy is loaded at gateway start, and revocation is "edit the recipe + restart the gateway".

The two systems are talking about the same control: **"a skill cannot do tools it was not explicitly authorized for, and the proof of the boundary is a static, auditable artifact"**. The artifact differs (RBAC RoleBinding vs Cedar policy file), the eval site differs (K8s API server admission vs gateway-side Cedar evaluator), and the lifecycle differs (workflow-scoped vs gateway-lifetime). But the *purpose* is identical, which is why this is the strongest overlap.

### 2.2 Shared SQLite workflow memory ≈ opsbench custody.log + evidence ledger

Sympozium's workflow memory is a single SQLite file mounted into every agent pod in a workflow. Agents read and write to a small set of tables: messages between agents, intermediate artifacts, tool-call traces, and the final workflow output. Operators inspect the SQLite file directly to reconstruct a workflow post-hoc.

opsbench, in F2 + F3, defines the same artifact differently. The `opsbench-gateway` emits a JSON-Lines `custody.log` for every MCP tool call (timestamp, agent class, tool, redacted args, sha256 of args/response). F3 adds Ed25519 receipts so each line carries a signature proving it was emitted by a key the operator controls. The evidence ledger is therefore a stream of signed JSON-Lines, not a SQLite database, and it covers tool calls only (not arbitrary inter-agent messages).

The overlap is again real but narrower than the RBAC/Cedar case: sympozium's memory covers *more* than opsbench's custody log (inter-agent messages, intermediate artifacts), but opsbench's custody log carries cryptographic provenance sympozium's memory does not. They are complementary, not equivalent.

### 2.3 MCP server integration ≈ F2 opsbench-gateway routing

Sympozium's membrane allows MCP-speaking servers to appear as tool sources for any agent the membrane authorizes. The membrane is the policy point — it decides which upstream MCPs are visible to which agents at which stage of the workflow.

opsbench-gateway is also a policy + routing point in front of upstream MCPs. The gateway demultiplexes per-upstream sub-paths, evaluates Cedar, redacts args, and writes the custody log. It does not, today, have a concept of "this MCP is visible only to agent A during workflow stage 2"; visibility is a static per-recipe property.

The two systems would route the same MCP traffic with different concerns: sympozium asks "which agent on which workflow step?", opsbench-gateway asks "does the Cedar policy say `Allow`?". A composed deployment would have both, with opsbench-gateway sitting inside the membrane and the membrane providing the workflow context to Cedar as additional `context` attributes.

### 2.4 Multi-channel handoffs ≈ opsbench's static SKILL.md model

Sympozium agents are reachable on Telegram, Slack, or Discord via channel adapters; a workflow can hand off from one channel to another mid-execution. Channel choice is a property of the agent at deployment time.

opsbench has no equivalent. Skills are static markdown files (`SKILL.md`) loaded by Pi or Claude Code; the "channel" is implicit (whatever host is running the skill). Hand-off between hosts is a manual operation today; the recipe doesn't describe it.

This is the area of **least overlap and most divergence**. opsbench has no opinion on channel orchestration; sympozium has a complete model. If we integrate, this surface is purely additive — opsbench skills get reachable over chat channels without opsbench having to design that surface itself.

### 2.5 Overlap summary

| Concern | sympozium primitive | opsbench primitive | Overlap strength |
| ------- | ------------------- | ------------------ | ---------------- |
| Per-skill authorization | Ephemeral RBAC RoleBinding on a sidecar ServiceAccount | Cedar `Allow`/`Deny` per agent class loaded by `opsbench-gateway` | Strong — same intent, different artifact + eval site |
| Audit trail | Workflow-memory SQLite with tool-call traces | JSON-Lines `custody.log` with Ed25519 receipts (F3) | Moderate — different schemas, different durability story, different provenance guarantees |
| MCP routing | Membrane controller selects which MCPs an agent sees | Gateway demuxes per-upstream sub-paths + evaluates Cedar | Strong on the "route MCP traffic" surface, weak on the "workflow-stage-scoped visibility" surface |
| Skill model | Sidecar container + RoleBinding + sandbox runtime | Markdown file (`SKILL.md`) loaded by Pi/Claude Code | Weak — same word, very different artifact |
| Inter-agent comms | First-class (channels + workflow memory) | None — opsbench has no opinion | None — purely additive |
| Sandboxing | gVisor / Kata at the pod boundary | None on file-install; would inherit from sympozium in K8s | None — additive |
| Deployment unit | Helm chart + CRDs in a K8s cluster | File install into `~/.claude/` or `~/.pi/` | None — orthogonal |

The summary makes the strategic shape clear: there are two strong overlaps (per-skill auth, MCP routing), one moderate overlap (audit trail), and three orthogonal-or-additive surfaces (skill model, inter-agent comms, sandboxing). The deployment unit is fully orthogonal — which is why "layer on top" is plausible at all.

## 3. Three relationship options

### Option A — Compete

opsbench stays file-install-only into `~/.claude/` (for Claude Code) or `~/.pi/` (for Pi). The F-series roadmap ignores sympozium. Justifications:

- opsbench's primary host is the developer laptop / single-host Pi devbox. Most opsbench users will never run a Kubernetes cluster.
- The F2 gateway already provides a policy + audit choke point; the F3 receipts already provide cryptographic provenance. The overlap with sympozium is mostly conceptual, not operational.
- Maintaining Helm charts, CRDs, and a K8s deployment story is a substantial scope addition for a project whose strategic identity is "file-installable ops toolkit".

Cost of Option A: we cede the K8s multi-agent deployment surface entirely. Anyone running sympozium will pick *its* skill model (sidecar + RBAC) instead of opsbench's recipe + Cedar model. opsbench's recipes do not become consumable inside a sympozium workflow.

### Option B — Compose

opsbench's recipes, Cedar policies, and signed receipts become consumable by sympozium agents running in Kubernetes via a `sympozium-opsbench-adapter` Helm sub-chart maintained inside the opsbench repo. The adapter:

- Mounts opsbench skills (`~/.claude/skills/*` equivalent) into sympozium skill sidecars as ConfigMap volumes.
- Translates opsbench Cedar policies into sympozium RoleBindings at workflow-start, and tears them down at workflow-end.
- Routes MCP traffic through `opsbench-gateway` running as a sidecar in the agent pod, so custody.log emission and Cedar evaluation happen the opsbench way.
- Persists custody.log into the shared SQLite workflow memory as an additional table (`opsbench_custody`), so sympozium's audit story includes opsbench's evidence.

Cost of Option B: substantial. We have to learn and track sympozium's CRD evolution, maintain the adapter against upstream changes, and write a translation layer between two different policy models (Cedar `Allow`/`Deny` vs Kubernetes RBAC verbs). The translation is non-trivial in the general case (Cedar `context` attributes have no Kubernetes RBAC analog).

### Option C — Layer on top (recommended)

Sympozium becomes a *recommended deployment mode* for opsbench in Kubernetes environments. The file-install (`~/.claude/`, `~/.pi/`) stays the default for laptops and single-host devboxes; an opt-in K8s deployment mode publishes opsbench skills + gateway as a sympozium-friendly Helm sub-chart. The two systems are described as complementary:

- opsbench is *the policy + evidence layer* (Cedar + receipts + custody.log).
- sympozium is *the K8s deployment + coordination layer* (membrane + RBAC sidecars + SQLite memory + channels).

Where they overlap, opsbench provides the *content* (the Cedar policy, the receipt format, the skill markdown) and sympozium provides the *runtime* (the RBAC binding, the workflow memory backend, the multi-channel adapter). Neither one has to become the other.

Cost of Option C: smaller than B but non-zero. We commit to a Helm sub-chart, a documented deployment path, and a per-pod selector for "Pi vs Claude Code agent runtime". We do *not* commit to maintaining a Cedar-to-RBAC translator or to absorbing sympozium's CRD surface into opsbench's spec model.

### 3.4 Side-by-side option comparison

| Dimension | A — Compete | B — Compose | C — Layer on top (recommended) |
| --------- | ----------- | ----------- | ------------------------------ |
| Deployment surfaces opsbench claims | File-install only | File-install + deep K8s integration | File-install (default) + K8s deployment-mode (opt-in) |
| New opsbench artifacts | None | Helm sub-chart + Cedar→RBAC translator + workflow-memory writer | Helm sub-chart + ConfigMap publisher + docs |
| Sympozium dependency cadence to track | None | Tight (every CRD breaking change is our problem) | Loose (pinned Helm-chart dependency, monthly review) |
| Strategic positioning | "opsbench is your laptop ops toolkit" | "opsbench is *the* policy + evidence layer for sympozium" | "opsbench is the policy + evidence layer; works on your laptop AND in your cluster" |
| Risk if sympozium pivots / loses momentum | Zero | High — adapter becomes load-bearing dead code | Low — sub-chart can be archived without affecting file-install |
| Risk if sympozium goes mainstream and we are not in it | High — opsbench bypassed in K8s shops | Low | Low |
| Implementation effort | None | ~3–4 weeks engineer time, ongoing maintenance | ~1 week engineer time, light maintenance |

The table is what makes C the obvious choice: it captures most of B's upside (presence inside sympozium deployments) at a fraction of B's maintenance load, and it eliminates A's strategic blind spot (the K8s deployment surface).

## 4. Recommended relationship — Option C (layer on top)

We recommend Option C. The reasoning, in order:

1. **The deployment-model difference is real.** opsbench is a file-install for individual operators; sympozium is a Helm-install for cluster operators. Forcing them into one model would break one of them. Layering accepts that both deployment shapes are legitimate and lets each one serve its native user.
2. **opsbench's value is reusable regardless of deployment mode.** The Cedar policies, the receipt format, the redacted custody log, the skill markdown — none of these are coupled to "where does the agent process run?". They are content + schema artifacts. Sympozium consuming them is purely additive.
3. **"Layer on top" lets us treat sympozium as a multiplier rather than a competitor.** Every sympozium deployment becomes a potential opsbench surface; every opsbench user with a K8s cluster gets a documented upgrade path. The strategic positioning is "opsbench works on your laptop AND in your cluster" rather than "opsbench OR sympozium".
4. **The maintenance cost is bounded.** A Helm sub-chart + a documented integration is a much smaller surface than a Cedar-to-RBAC translator (Option B's hardest piece). We can ship Option C and revisit deeper Option-B integration only if real-world demand appears.
5. **It preserves opsbench's identity.** opsbench is the policy + evidence project. Becoming a K8s coordination project (Option B as a maximalist read) would dilute that. Sympozium is already the K8s coordination project — let it be that, and consume it.

The recommendation is consistent with the F6 framing in the parent roadmap: "evaluation, not implementation commitment". Option C lets us land a small adapter sub-chart as the *only* implementation work, with everything else being documentation + recipe annotations.

### 4.1 What recommending C explicitly does *not* commit us to

To prevent scope creep on the back of this evaluation, the following are explicitly out of scope for the Option-C implementation:

- **Authoring sympozium CRDs.** We do not add new CRDs to sympozium upstream. If a deeper integration ever needs one, that conversation happens with the sympozium maintainer; opsbench does not unilaterally extend sympozium's API.
- **Translating Cedar policy semantics into Kubernetes RBAC.** The adapter delivers Cedar to the gateway sidecar as a ConfigMap; it does not synthesize RoleBindings from Cedar `Allow` clauses. The two policy systems live side by side and are documented as such.
- **Replacing sympozium's workflow memory.** Custody.log lands in the SQLite as an additional table, not a replacement for sympozium's existing tables. Sympozium remains the system of record for its native artifacts.
- **Shipping the adapter as an alternative to file-install.** File-install remains the default and the documented onboarding path. The adapter is purely an extra deployment mode for users who already run sympozium.
- **Maintaining a hosted sympozium**. We do not offer to host sympozium for users. The adapter assumes the user (or their cluster operator) has already deployed sympozium and is responsible for it.

These guardrails are what keep Option C cheap. If we ever cross any of them, we have re-derived Option B and should re-evaluate explicitly rather than drift into it.

### 4.2 Decision criteria and how Option C scores against them

The F6 evaluation criteria (carried over from the parent roadmap's "Cross-cutting principles") apply directly. Scoring each one for Option C:

1. **Pi-first multi-host.** Option C ships pod templates for both Pi and Claude Code runtimes; the default `agentRuntime` value is `pi`. Pi-first is preserved. Score: pass.
2. **Vendor MCPs > custom code.** The adapter does not re-implement sympozium — it depends on sympozium upstream as a Helm-chart dependency, vendor-style. Score: pass.
3. **Policy + evidence are non-negotiable.** Cedar policies are delivered as ConfigMaps; Ed25519 receipts produced in K8s are interchangeable with file-install receipts; custody.log is persisted both as JSON-Lines and as a SQLite table. Policy + evidence guarantees hold in the K8s deployment mode. Score: pass.
4. **Read-only by default; writes are gated.** No change — the Cedar policy file is the source of truth in both deployment modes. Score: pass.
5. **Standalone PRs.** The adapter sub-chart lands as one PR. Cedar ConfigMap output mode in the F1 generator lands as a separate PR. Documentation lands as a third PR. Score: pass.
6. **Tests / lint clean.** The adapter ships with a `chart-testing` CI job that lints the Helm chart, dry-runs `helm install` against a Kind cluster, and validates the generated manifests with `kubeval`. Score: pass.

All six criteria pass for Option C. Option B fails on criterion 1 (the Cedar→RBAC translator is a substantial custom-code investment) and criterion 5 (the translator + adapter + tests would be hard to split into independently revertable PRs). Option A fails on criterion 3 (the K8s deployment surface gets no policy + evidence guarantees because we are not in it). This scoring is what closes the recommendation.

## 5. Concrete integration points (if C is approved)

### 5.1 Sub-chart spec

`packages/opsbench-sympozium-adapter/` ships a Helm sub-chart with the following structure:

```text
packages/opsbench-sympozium-adapter/
├── Chart.yaml                 # sympozium-opsbench-adapter, depends-on: sympozium >= <pinned>
├── values.yaml                # default values; see §5.2 for the per-pod selector
├── templates/
│   ├── opsbench-skills-cm.yaml      # ConfigMap of skill markdown files
│   ├── opsbench-policies-cm.yaml    # ConfigMap of Cedar policy files (from F1 generator)
│   ├── gateway-sidecar.yaml         # opsbench-gateway as a sympozium-compatible sidecar
│   ├── custody-pvc.yaml             # PVC for custody.log (or hooks into sympozium SQLite)
│   └── receipt-key-secret.yaml      # Ed25519 signing key (F3) as a Kubernetes Secret
└── README.md                  # opsbench → sympozium integration guide
```

The sub-chart is versioned with opsbench (same semver) and is published to the same OCI registry as the `opsbench-gateway` image. It depends on sympozium as an upstream chart, never vendoring it.

### 5.2 opsbench skill mounting

Skills are not rebuilt for sympozium. The adapter ConfigMap (`opsbench-skills-cm.yaml`) contains the *same* markdown files that the file-installer puts into `~/.claude/skills/` or `~/.pi/skills/`. Each sympozium skill-sidecar mounts the ConfigMap at the path the in-pod agent runtime expects:

- Claude Code runtime → mount at `/root/.claude/skills/`.
- Pi runtime → mount at `/root/.pi/skills/`.

The mount path is templated from the per-pod selector in `values.yaml`:

```yaml
opsbenchAdapter:
  agentRuntime: pi          # or "claude-code"; default is pi (matches F-series Pi-first principle)
  skillsConfigMap: opsbench-skills
  policiesConfigMap: opsbench-policies
  gatewayUrl: http://localhost:8765
```

The same ConfigMap is reused across all pods running the same agent class; updates to skills are propagated by re-applying the ConfigMap (sympozium's controller already handles the pod-restart cascade).

### 5.3 custody.log persistence in shared SQLite

The default file-install persists `custody.log` as a JSON-Lines file under `~/.local/share/opsbench/`. In the sympozium adapter, that file is *also* written, but each line is additionally inserted into the sympozium workflow-memory SQLite under a new table:

```sql
CREATE TABLE opsbench_custody (
  workflow_id  TEXT NOT NULL,
  ts           TEXT NOT NULL,          -- ISO-8601
  agent_class  TEXT NOT NULL,
  tool         TEXT NOT NULL,
  args_sha256  TEXT NOT NULL,
  response_sha256 TEXT NOT NULL,
  cedar_decision TEXT NOT NULL,        -- "Allow" | "Deny"
  receipt_sig  BLOB,                   -- F3 Ed25519 signature; nullable until F3 ships
  PRIMARY KEY (workflow_id, ts, tool)
);
```

The gateway sidecar's custody writer learns a second back-end (`--custody-backend=sqlite+file`), which fan-outs to both destinations. Sympozium operators inspecting workflow memory now see opsbench evidence alongside sympozium's native messages table; opsbench users inspecting `custody.log` see the same content with no change.

### 5.4 Pi-vs-Claude-Code per-pod selection

Each sympozium agent pod selects one opsbench-supported runtime via the `opsbenchAdapter.agentRuntime` value (see §5.2). The adapter ships pod templates for both:

- `pi-agent.yaml` — base image `ghcr.io/projectdiscovery/pi:<pinned>`, mounts `~/.pi/skills/` from the skills ConfigMap, points at `localhost:8765` for MCP routing.
- `claude-code-agent.yaml` — base image `ghcr.io/anthropics/claude-code:<pinned>`, mounts `~/.claude/skills/` from the skills ConfigMap, same gateway URL.

The default is Pi (per the F-series Pi-first principle). Both pod templates run alongside an `opsbench-gateway` sidecar so MCP traffic stays local to the pod (no cluster-wide gateway hop on the critical path). Cluster-wide gateway deployment is a future option but out of scope for the initial adapter.

### 5.5 Cedar policy delivery

The F1 generator script runs locally and produces `tools.cedar` + `tools-generated.cedar`. For the adapter, we add a `--output=k8s-configmap` flag that emits a ConfigMap YAML instead of bare files; CI publishes the ConfigMap as an artifact alongside the release. Sympozium operators install opsbench by applying the ConfigMap and the Helm sub-chart; updates to recipes regenerate the ConfigMap and rolling-restart the affected pods.

### 5.6 Receipt key bootstrap (F3 dependency)

F3's Ed25519 key bootstrap on file-install runs `opsbench keys init` which writes the private key under `~/.local/share/opsbench/keys/`. In the K8s deployment, the same key material is provisioned as a Kubernetes Secret (`receipt-key-secret.yaml`) mounted into the gateway sidecar. Key rotation in K8s is a Secret-update + pod restart; key rotation on the file-install is the existing `opsbench keys rotate` script. The signing schema is identical across both deployments — receipts produced in K8s and on a laptop are interchangeable, verifiable by the same verifier CLI.

### 5.7 Cedar evaluation site inside the adapter

A subtle but important detail: in the file-install, Cedar evaluation happens inside `opsbench-gateway` running as a local process the agent talks to over `localhost:8765`. In the K8s adapter, the gateway sidecar serves the same role at the pod level — the agent container talks to `localhost:8765` *inside the same pod*, and the gateway sidecar evaluates Cedar and writes custody before forwarding the call. Cedar evaluation **does not** move into the sympozium membrane controller in the recommended option. This is deliberate:

- The membrane is a K8s-control-plane concern; Cedar is a per-call data-plane concern. Conflating them would mean every Cedar policy change reconciles through the K8s API server, which is far too slow for a tool-call hot path.
- Keeping Cedar in the sidecar means the *same* gateway binary runs in both deployment modes. The custody-log writer, the redactor, the receipt signer — all of it is unchanged. The only difference is where the binary's config comes from (file vs ConfigMap) and where its outputs land (filesystem vs PVC + SQLite).
- It preserves the F2 architecture verbatim. The sidecar deployment is purely a packaging change, not an architecture change. That makes Option C cheap to ship and cheap to revert if sympozium pivots.

### 5.8 Channel adapter passthrough

Sympozium's multi-channel handoff (Telegram/Slack/Discord) is *not* in opsbench's scope, but the adapter must not block it. The integration documents that channel adapters are a sympozium concern and are configured via sympozium's own CRDs; opsbench does not wrap them or proxy them. Any channel traffic that triggers an MCP call still routes through `opsbench-gateway` at the destination pod, so the policy + evidence guarantees still hold. We do not gain a "Slack-fronted opsbench skill" surface from this integration without sympozium being installed — and that is fine. The F-series principle is that opsbench is content + schema; channel orchestration is somebody else's primitive.

### 5.9 Documentation

`docs/deployments/sympozium.md` is the single landing page for the integration. It documents:

- When to choose sympozium deployment vs file-install (cluster vs laptop).
- Step-by-step Helm install of sympozium + the opsbench adapter.
- How to choose Pi vs Claude Code runtime per agent class.
- How to inspect custody evidence in SQLite vs in `custody.log`.
- How to verify Ed25519 receipts produced inside a K8s deployment.
- Known limitations vs the file-install (no multi-channel by default unless sympozium channel adapters are also installed).

The `docs/integrations.md` rewrite from F0 gains a "Deployment modes" section pointing at this doc.

## 6. Open questions

Three only:

1. **Does sympozium's ephemeral RBAC respect Cedar policies natively, or do we need a translation layer?** The membrane controller may have an extension point for external policy evaluators (so opsbench-gateway's Cedar decision could feed back into the membrane), or it may treat RBAC as the single source of truth. If the former, Option C gets cleaner — Cedar becomes the policy language and RBAC is derived. If the latter, we ship the two policy models side-by-side and document the redundancy. Resolving this requires reading the sympozium membrane CRD spec and confirming with the upstream maintainer.
2. **Is sympozium's SQLite workflow memory durable enough to be our evidence ledger in a K8s deployment, or do we need to dual-write to object storage?** The custody log is an audit artifact — losing it (pod restart, PVC deletion, node failure) is unacceptable. Sympozium's docs describe SQLite-on-PVC as the default; whether the PVC retention policy is configurable enough to meet opsbench's evidence guarantees needs verification before we commit to "custody.log lives in the SQLite". Worst case the adapter dual-writes to S3/MinIO via an opsbench-managed exporter.
3. **What is the upstream-sync cadence we commit to for the sympozium dependency in the Helm chart?** Sympozium is pre-1.0 and CRDs may evolve. We need a pinning + sync policy similar to the `stacklok/toolhive` cadence F2 commits to (monthly merge from upstream `main`), but for a Helm chart dependency. Annual breaking-change windows? Quarterly? The answer affects how much adapter-maintenance load we sign up for.

These are decision-blockers for an implementation commitment but not for the Option-C *recommendation* itself. The recommendation lands as evaluation; the implementation lands only after these three are answered, in a follow-up plan doc.

## 7. Next steps

1. **Reviewer approval of the Option-C recommendation.** This evaluation is the artifact for that decision; the parent roadmap's F6 "decision artifact" requirement is satisfied by approving this doc.
2. **Resolve the three open questions in §6.** Path: read the sympozium membrane CRD spec, file a short upstream question on question 1 (extension hook for external policy evaluators), draft a PVC retention proposal for question 2, and lock a pinning policy for question 3 by analogy to F2's monthly-merge cadence.
3. **Land a follow-up plan doc.** `docs/superpowers/plans/<date>-f6-sympozium-adapter-plan.md` translates Option C into discrete PRs: (a) ConfigMap output mode for the F1 generator, (b) Helm sub-chart skeleton, (c) custody dual-write back-end in the gateway, (d) docs.
4. **Sequence against F4 team packages.** The adapter has no team-package dependency, so it can interleave with F4 work without blocking. The plan doc commits to a specific F4 phase to land alongside (current default: alongside `team-platform-engineering`, the team most likely to operate K8s clusters).

Each of the four next steps is independently revertable and independently shippable, matching the F-series cross-cutting principle of "no PR bundles unrelated phases".

## 8. Revisit triggers

This evaluation is not final-for-all-time. We re-open the Option-A/B/C decision if any of the following occur:

- **Sympozium 1.0 ships with a stable CRD surface and a documented external-policy hook.** That would significantly lower the cost of Option B's tighter coupling; the trade-off table in §3.4 changes shape.
- **A first-party Kubernetes deployment of opsbench gains traction independently of sympozium** (e.g. an `opsbench-operator` emerges in the catalog). Option C's assumption is that sympozium is the K8s deployment story; if a more direct path exists, the layering recommendation may need to point at it instead.
- **The F4 team-platform-engineering package surfaces a pattern that requires workflow-stage-scoped Cedar context.** That would push us toward deeper sympozium integration (Option B-ish), because membrane-aware Cedar context is the natural fit.
- **Cedar-for-agents (F1) adds a Kubernetes RBAC emitter upstream.** That would eliminate the largest cost of Option B (the translator), making B noticeably cheaper than it is today.

Until one of those triggers fires, the recommendation stands: Option C, layer on top, file-install remains the default, sympozium is a documented optional deployment mode for users who already operate Kubernetes.
