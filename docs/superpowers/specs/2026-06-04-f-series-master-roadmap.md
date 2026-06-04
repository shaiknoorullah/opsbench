# F-Series Master Roadmap — opsbench Foundation-First Pivot

**Status:** draft 2026-06-04 — awaiting reviewer approval
**Author:** Claude Code session (Shaik Noorullah, driver)
**Supersedes:** [`2026-06-04-multi-phase-execution-roadmap.md`](./2026-06-04-multi-phase-execution-roadmap.md) (the P1–P7 roadmap)
**Inputs:** [`../research/2026-06-04-ecosystem-catalog.md`](../research/2026-06-04-ecosystem-catalog.md) (25-domain, 367-candidate ecosystem research)

## Why this exists

The P-series roadmap (P1–P7) led with team-package work (`team-incident-response` polish → `team-platform-engineering` → `team-data-platform` → …). A 25-domain ecosystem research workflow run later the same day surfaced three convergent patterns that the P-series didn't anticipate:

1. **Cedar-derived allowlists** — `cedar-policy/cedar-for-agents` programmatically generates per-agent Cedar policies from MCP tool manifests. opsbench's `tools.cedar` does this by hand.
2. **MCP gateway with signed receipts** — `scopeblind-gateway`, `agentgateway`, `stacklok/toolhive` all converge on a single architectural primitive: a policy + audit layer in front of N MCP servers. That's not a team package — that's the platform opsbench wants to be.
3. **Per-tool runtime enforcement** — `falcosecurity/prempti` enforces tool-call boundaries at the syscall level beneath Cedar. Defense-in-depth.

The catalog also surfaced ~30 vendor-official MCPs (HashiCorp Vault, GitHub, AWS, Azure, GCP, Grafana, Argo, k8sgpt, Trivy, Crossplane, Kubescape, Velero, …). Most of opsbench's planned recipe work collapses into pointing at existing high-quality vendor MCPs.

**Strategic re-positioning:** opsbench becomes **the policy + evidence layer that wraps any agent's MCP usage**. Team packages still ship — they sit on top of the foundation rather than parallel to it. Recipes are bulk-shipped as the index play that establishes presence.

## F-series at a glance

| Phase | Name | Headline deliverable | Est. effort |
| ----- | ---- | -------------------- | ----------- |
| **F0** | Recipe bulk-ship | ~30 one-pager MCP recipes from the catalog + `docs/integrations.md` rewrite | 2–3 days |
| **F1** | Cedar-for-agents adoption | Generator script that auto-derives `tools-generated.cedar` from each recipe | 1 week |
| **F2** | `opsbench-gateway` | Fork `stacklok/toolhive`; add Cedar eval + custody.log emission | 2–3 weeks |
| **F3** | Signed receipts (evidence v2) | Ed25519 receipt schema; `post-tool-use.sh` emits/verifies; key bootstrap in installer | 1 week |
| **F4** | Team packages on the foundation | 5 new team packages, each thin because the foundation does the policy/audit work | 3–6 weeks |
| **F5** | Distribution + Codex parity | Codex variants for every skill; installer matrix (Homebrew/AUR/nix) | 1–2 weeks |
| **F6** | Architectural evaluations & integrations | agentgateway depth, sympozium, prempti, scopeblind alignment | 2 weeks |

**Cumulative scope:** ~12–17 weeks of focused work. F4 sub-teams can run in parallel; F5/F6 can interleave with F4.

## Dependency graph

```
F0 ──► F1 ──► F2 ──► F3 ──► F4 (5 teams in parallel) ──► F5
                                          │
                                          ▼
                                          F6 (interleave)
```

- F0 must precede F1 because F1's generator iterates over the recipes.
- F1 must precede F2 because the gateway needs Cedar policies to evaluate.
- F3 can technically ship before F2, but the receipts are most useful when emitted *by the gateway*, so we ship F2 first.
- F4 teams are independent once F3 ships.

## Cross-cutting principles (apply to every F)

1. **Pi-first multi-host.** opsbench's primary agent host is **Pi**. Every recipe, skill, and agent ships a Pi-flavored variant first, with Claude Code / Codex CLI / GitHub Copilot / Cursor / Gemini / OpenCode as secondary parity targets. Documentation leads with Pi examples; "also supports …" sections cover the others. The installer privileges Pi (default install path, primary plugin marketplace registration). Other hosts get parity via `tools/<host>-compat-layer/` adapters.
2. **Vendor MCPs > custom code.** When a vendor ships a real MCP, opsbench points at it. We do not re-implement what `hashicorp`, `microsoft`, `awslabs`, `grafana`, `argoproj`, `aquasecurity` etc. have already shipped.
3. **Policy + evidence are non-negotiable.** Every recipe and skill specifies a Cedar policy posture. Every artifact gets SHA-256 (F3+: Ed25519) sealed.
4. **Read-only by default; writes are gated.** Any MCP tool with mutation potential ships with Cedar `Deny` plus an explicit `Allow` per agent class.
5. **Standalone PRs.** No PR bundles unrelated phases. Each F-phase ships as one or more PRs, each independently revertable.
6. **Tests / lint clean** on every commit. Pre-existing main lint failures got fixed in PR #15; we keep main green going forward.

---

## F0 — Recipe bulk-ship (catalog-driven)

**Goal:** Ship one-pager MCP recipes for the catalog's high-fit candidates, establishing opsbench as the curated index of vendor MCPs and community wrappers.

### Scope

Drawn from the catalog's "high-fit by integration_vector: mcp-recipe" table (filtered to active, licensed, vendor-or-community-credible) plus the top-10 picks. Target count: **30 recipes**, with room to drop to 25 or expand to 35 based on dedup pass.

**Inherited from old P1 (PR #17, content reused):**

- `thehive-mcp.md` (with EXPERIMENTAL banner + `read_only` default)
- `opencti-mcp.md`
- `azure-skills-mcp.md`
- `k8sgpt-mcp.md`
- `cli-anything-framework.md`
- `falco-event-ingest` skill (Falco-via-CLI-Anything substitution)
- `azure-mcp.md` See-also update
- `docs/integrations.md` initial creation

**New from catalog (the bulk-ship core):**

| Recipe | Upstream | License | Notes |
| ------ | -------- | ------- | ----- |
| `vault-mcp.md` | `hashicorp/vault-mcp-server` | MPL-2.0 | Official KV/PKI MCP, stdio + HTTP |
| `github-mcp.md` | `github/github-mcp-server` | MIT | 30.4k★, canonical GitHub surface |
| `awslabs-mcp.md` | `awslabs/mcp` | Apache-2.0 | EKS/CloudWatch/IAM monorepo; per-server scoping |
| `gcloud-mcp.md` | `googleapis/gcloud-mcp` | Apache-2.0 | GKE + Cloud Logging + IAM |
| `microsoft-mcp.md` | `microsoft/mcp` | MIT | Azure parity layer (different from azure-skills) |
| `argocd-mcp.md` | `argoproj-labs/mcp-for-argocd` | Apache-2.0 | Vendor-blessed Argo CD |
| `argocd-akuity-mcp.md` | `akuity/argocd-mcp` | Apache-2.0 | Argo creators' alternative; pair with Promotion Advisor |
| `argo-workflows-mcp.md` | `Heapy/argo-workflows-mcp` | Apache-2.0 | Workflows MCP with SQLite-backed audit |
| `kubernetes-mcp.md` | `containers/kubernetes-mcp-server` | Apache-2.0 | Distro-agnostic, non-destructive mode, OTel |
| `kubernetes-cli-bridge-mcp.md` | `alexei-led/k8s-mcp-server` | MIT | kubectl/helm/istioctl/argocd CLI bridge |
| `helm-mcp.md` | `zekker6/mcp-helm` | MIT | Read-only Helm-repo MCP |
| `crossplane-mcp.md` | `briferz/crossplane-mcp` | Apache-2.0 | Read-only troubleshooting |
| `crossplane-control-plane-mcp.md` | `upbound/controlplane-mcp-server` | Apache-2.0 | Vendor CRUD |
| `crossplane-marketplace-mcp.md` | `upbound/marketplace-mcp-server` | Apache-2.0 | Vendor marketplace |
| `terraform-mcp.md` | `hashicorp/terraform-mcp-server` | MPL-2.0 | Official Registry + HCP/TFE |
| `ansible-mcp.md` | `ansible/vscode-ansible` (Dev Tools MCP) | Apache-2.0 | Official Red Hat Ansible MCP |
| `docker-mcp.md` | `docker/mcp-gateway` | MIT | Docker MCP toolkit |
| `inspektor-gadget-mcp.md` | `inspektor-gadget/ig-mcp-server` | Apache-2.0 | CNCF eBPF MCP for kernel forensics |
| `kubeshark-mcp.md` | `kubeshark/kubeshark` | Apache-2.0 | eBPF traffic analyzer with built-in MCP |
| `talos-mcp.md` | `Nosmoht/talos-mcp-server` | MIT | Talos gRPC apid MCP |
| `trivy-mcp.md` | `aquasecurity/trivy-mcp` | MIT | Vendor CVE-scan MCP |
| `kubescape-mcp.md` | `kubescape/kubescape` (built-in) | Apache-2.0 | CNCF posture + KAgent plugin |
| `crowdstrike-falcon-mcp.md` | `CrowdStrike/falcon-mcp` | MIT | 20+ Falcon modules incl. RTR |
| `kyverno-mcp.md` | `nirmata/kyverno-mcp` | AGPL-3.0 | External-only (no vendoring) |
| `prometheus-mcp.md` | `pab1it0/prometheus-mcp-server` | MIT | Lightweight PromQL, read-only |
| `grafana-mcp.md` (replaces existing custom) | `grafana/mcp-grafana` | Apache-2.0 | Vendor MCP; supersedes the current `grafana-mcp.md` recipe |
| `loki-mcp.md` | `grafana/loki-mcp` | (verify) | Dedicated Loki MCP |
| `signoz-mcp.md` | `SigNoz/signoz-mcp-server` | Apache-2.0 | OTel-native |
| `otel-mcp.md` | `traceloop/opentelemetry-mcp-server` | Apache-2.0 | Multi-backend OTel traces |
| `victoriametrics-mcp.md` | `VictoriaMetrics/mcp-victoriametrics` | Apache-2.0 | Official VM MetricsQL |
| `alertmanager-mcp.md` | `ntk148v/alertmanager-mcp-server` | Apache-2.0 | Silences/groups MCP |
| `flux-mcp.md` | `controlplaneio-fluxcd/flux-operator` | AGPL-3.0 | External-only |
| `cedar-for-agents-reference.md` | `cedar-policy/cedar-for-agents` | (verify) | Reference for F1 |

That's 33 new recipes plus 5 inherited from old P1 = 38 entries total. We'll trim to 30 during the spec self-review pass if any are weak.

### Out of scope for F0

- Cedar policy file generation (that's F1)
- Gateway integration (F2)
- Receipt emission updates (F3)
- Team-package routing — for now all recipes land in `packages/team-incident-response/mcp-recipes/`. F4 reorganizes by team package.
- Reordering existing recipes — the 17 existing recipes stay where they are.

### Quality bar

Each F0 recipe ships **the lighter template** — Source, Install, Configuration, Auth, Tools surfaced, Safety, Caveats. Skip the deep verification rituals from the old P1 spec (no `jq -e` per recipe in CI, no manual end-to-end test plan). Markdownlint + cspell + the existing JSON-block validation in `lint:md` are the safety net.

### Acceptance criteria

- 30 ± 5 new recipe files in `packages/team-incident-response/mcp-recipes/`
- All CI lint checks pass
- `docs/integrations.md` rewritten with all entries (inherited + new) categorized by integration vector
- Team README counts updated
- Inherited Falco skill ships unchanged
- One PR (or one PR per natural grouping if reviewer requests split)

### PR shape

`feat/f0-recipe-bulk-ship` → PR titled `feat(team-incident-response): F0 bulk-ship ~30 MCP recipes from ecosystem research catalog`.

Detailed implementation plan: [`../plans/2026-06-04-f0-recipe-bulk-ship-plan.md`](../plans/2026-06-04-f0-recipe-bulk-ship-plan.md).

---

## F1 — Cedar-for-agents adoption

**Goal:** Stop hand-writing per-agent Cedar allowlists. Generate them from each MCP recipe's tool list, using `cedar-policy/cedar-for-agents` as the conversion layer.

### Scope

- Adopt `cedar-policy/cedar-for-agents` as a dev-dependency (likely a CLI invoked from a script, not vendored).
- New file: `scripts/generate-cedar-policy.sh`. Inputs: recipe directory + the agent's role manifest. Output: `policies/tools-generated.cedar`.
- Existing `policies/tools.cedar` stays as the authoritative override (hand-written rules win over generated rules).
- Each recipe gets a structured `tools:` block in its frontmatter (or a sibling `tools.yaml`) that the generator parses. Recipes without the block are skipped (the existing `azure-mcp.md` etc. don't have it — F0 adds it to new recipes, F1 backfills the existing 17).
- Generator runs in `prepare` script and in CI (`validate-cedar`).

### Architectural shape

```
recipe-N.md  ───┐
recipe-2.md ────┼──► generate-cedar-policy.sh ──► tools-generated.cedar
recipe-1.md  ───┘                                              │
                                                                ▼
                                                       (with tools.cedar)
                                                                │
                                                                ▼
                                                        Cedar evaluator
                                                          (in F2 gateway)
```

### Acceptance criteria

- `scripts/generate-cedar-policy.sh` produces a valid Cedar file
- Generated file is gitignored (regenerated on `npm install`)
- `validate-cedar` CI job validates both files
- Every F0 recipe gets a `tools:` frontmatter block; the 17 pre-existing recipes are backfilled
- Old `tools.cedar` shrinks (because most rules are now generated); only hand-overrides remain

### PR shape

Two PRs: `feat/f1-cedar-generator` (script + CI + backfill) and `feat/f1-recipe-tools-frontmatter` (add `tools:` blocks across recipes).

Full spec doc: TBD after F0 ships. F1 brainstorming pass happens then.

---

## F2 — `opsbench-gateway`

**Goal:** Provide a Cedar-evaluated MCP gateway that sits in front of N MCP servers, evaluates policy per call, and emits custody-log entries automatically.

### Scope

- Fork `stacklok/toolhive` (Apache-2.0, ~1.8k★, vendor-active) as the base. Toolhive already provides MCP routing + per-tool policy hooks; we add Cedar evaluation and custody.log emission.
- Live at `packages/opsbench-gateway/` as a new sub-package.
- Distribution: Docker image (`ghcr.io/shaiknoorullah/opsbench-gateway`) + statically-linked binary.
- Configuration: `gateway.yaml` lists upstream MCPs + Cedar policy path + custody.log path.
- Drop-in: users replace their direct MCP server config with the gateway's URL.

### Architectural shape

```
agent ──► opsbench-gateway ──┬──► upstream MCP A (e.g., vault-mcp-server)
                              ├──► upstream MCP B (e.g., github-mcp-server)
                              ├──► upstream MCP C (e.g., grafana-mcp)
                              └──► ...
              │
              ├──► Cedar policy eval (tools.cedar + tools-generated.cedar)
              └──► custody.log append (with F3: Ed25519 signed receipts)
```

### Why fork toolhive

- Already Apache-2.0 (compatible with opsbench MIT).
- ~1.8k★ and vendor-active (stacklok), so we get upstream improvements.
- Has existing per-tool policy hooks that we map to Cedar without rewriting the routing layer.
- Alternative considered + rejected: `agentgateway` (Rust/Envoy) — pre-GA, would be a substantial rewrite. Revisit in F6.

### Out of scope

- Distributed deployment (single-host only for F2)
- Multi-tenancy (single user per gateway instance)
- Web UI (gateway runs headless; observability via custody.log + Grafana MCP)

### Acceptance criteria

- Fork lives at `packages/opsbench-gateway/` (or as a sibling repo if license requires, but vendoring under MIT-friendly Apache-2.0 is acceptable)
- Gateway routes to ≥3 upstream MCPs simultaneously
- Cedar policy evaluation blocks denied calls; returns clear error to agent
- Custody.log append includes: ts, agent_class, tool, decision, redacted_args, latency_ms
- Docker + binary release CI
- Recipes from F0 updated to point at gateway URL (with optional direct connection still documented)

### PR shape

Probably 3-5 PRs: fork + license headers; Cedar evaluation layer; custody integration; CI + release; recipe updates.

Full spec doc: TBD after F0 ships.

---

## F3 — Signed receipts (evidence v2)

**Goal:** Cryptographically verifiable audit trail. Every tool call produces an Ed25519-signed receipt the user can verify offline.

### Scope

- Define `schemas/receipt.v1.json` (under `packages/team-incident-response/schemas/` initially; federates in F5).
- Receipt content: ts, gateway_id, agent_class, tool, args_sha256, response_sha256, decision, signer_pubkey, signature.
- Key bootstrap: `scripts/install.sh` generates an Ed25519 keypair, stores private key at `~/.config/opsbench/keys/gateway.key` (mode 600), publishes public key fingerprint to the user.
- `post-tool-use.sh` updated to verify incoming receipts and write to `custody.log` alongside the existing SHA-256 record.
- Optional: receipt stream to S3 / Azure Blob / GCS for tamper-evident long-term storage.

### Pattern source

`scopeblind-gateway` (catalog watch list) — Cedar-evaluated MCP proxy with Ed25519-signed receipts. We do not vendor; we adopt the receipt format and add it to opsbench-gateway.

### Acceptance criteria

- Schema validates against draft 2020-12
- Receipt verifier in `scripts/verify-receipts.sh` validates a custody.log offline
- F2 gateway emits receipts by default; can be disabled via config for users who don't want the overhead
- Backwards compatible: existing custody.log entries (SHA-256 only) still readable

Full spec doc: TBD.

---

## F4 — Team packages on the foundation

**Goal:** Ship the team-package catalog. Each team is thin because policy/evidence/gateway work is done by the foundation.

### Order

1. **`team-platform-engineering`** — IaC orchestration (Terraform/Pulumi/Crossplane), GitOps runners (Argo CD/Flux), drift detection, env promotion. Templated on `Azure/git-ape`. Catalog surfaced ~40 strong candidates across argocd/terraform/crossplane/progressive-delivery domains.
2. **`team-security-response`** — Wazuh, MISP, TheHive, OpenCTI, Velociraptor, CrowdStrike Falcon MCP, Trivy, Kubescape. Promoted from v5.x; catalog showed the SOC tooling ecosystem is mature.
3. **`team-network-operations`** — eBPF (Cilium, Inspektor Gadget, Pixie), Kubeshark, mesh ops (Istio/Linkerd), DNS forensics. Promoted from v5.x; eBPF MCPs are vendor-shipped now.
4. **`team-data-platform`** — Backup verifiers (Velero/Kasten/Stash), schema migrations (Liquibase/Flyway/Atlas), CDC pipelines (Debezium).
5. **`team-it-helpdesk`** — Identity (Entra ID / Okta / Keycloak), endpoint (Intune / Jamf), M365 / Google Workspace.

### Per-team scope (uniform)

- 8–15 skills
- 5–15 agents (orchestrator + specialists)
- 3–6 JSON schemas
- Team-specific Cedar policies (small, because most flow through tools-generated.cedar)
- Team-specific MCP recipes (curated from the catalog)
- Team-specific hooks (small, foundation does the heavy lift)

### Acceptance criteria per team

- Skill + agent frontmatter validates
- All recipes point at gateway by default
- Cedar policies enforce least-privilege per agent class
- One PR per team
- Each team has its own brainstorming pass before its spec

### PR shape

5 team-package PRs over ~6 weeks. Can parallelize (different files, different reviewers).

---

## F5 — Pi-first multi-host parity + installer matrix

**Goal:** Establish Pi as the primary opsbench host with first-class skill + agent + recipe support, then bring all other coding agents (Claude Code, Codex CLI, GitHub Copilot, Cursor, Gemini, OpenCode) to parity. Ship distro-packaged installers.

### Host priority order

1. **Pi** — primary. Default install path. Skills authored against Pi's manifest first; other hosts derive from the Pi version.
2. **Claude Code** — secondary parity (it's opsbench's bootstrap host; we keep parity tight).
3. **Codex CLI** — secondary parity.
4. **GitHub Copilot CLI / VS Code Chat** — tertiary parity.
5. **Cursor**, **Gemini**, **OpenCode**, **Qodercli** — tertiary parity (best-effort, community-maintained adapters welcome).

### Pi-first work (substantial — the headline phase)

- New top-level dir `tools/pi-compat-layer/` mirroring the existing `tools/codex-compat-layer/`. Generator script `tools/pi-compat-layer/adapt.sh` reads opsbench SKILL.md and emits Pi-native skill manifests.
- Author the **canonical Pi distribution** of every existing skill in `team-incident-response` (11 skills + 33 agents). Pi gets the primary install path; Claude Code becomes the derived form.
- Pi-specific safety hooks: Pi's invocation surface has its own conventions; `tools/pi-compat-layer/hooks/` adapts opsbench's `PreToolUse`/`PostToolUse`/`SubagentStop` to Pi's equivalent hooks. Custody.log emission stays identical.
- Pi marketplace registration — opsbench appears as the recommended ops/SRE plugin in Pi's plugin marketplace.
- New CI job: `pi-validate` runs the Pi adapter and validates the generated manifests.

### Other-host parity (after Pi lands)

- Strengthen `tools/codex-compat-layer/adapt.sh` to handle Agent / TaskCreate / Skill semantics properly (today they're TODO placeholders).
- Auto-emit Codex / Copilot / Cursor / Gemini / OpenCode variants for every skill + agent.
- One CI job per host adapter (`codex-validate`, `copilot-validate`, etc.).
- Each host gets its own short README (`tools/<host>-compat-layer/README.md`) explaining the install flow.

### Installer matrix (last in F5)

- Homebrew formula + tap setup. Brew install defaults to **Pi-first** layout; user can pass `--host claude-code` to switch.
- AUR PKGBUILD with same default + override.
- `flake.nix` for Nix.
- CI matrix that builds each on tag push.

### Acceptance criteria

- `pi-validate` CI passes for all 11 skills + 33 agents
- Pi marketplace listing live (or a clear PR/registration path open with the Pi team)
- `codex-validate` CI passes
- `brew install shaiknoorullah/opsbench/opsbench` works on macOS + Linux (defaults to Pi)
- `yay -S opsbench` works on Arch
- `nix run github:shaiknoorullah/opsbench` works
- Every team package's README lists supported hosts in priority order

### Why Pi-first changes scope of F0–F4

- **F0** — recipe config snippets must include a Pi block first, then a Claude Code block. Recipe template (in the F0 plan) needs an update before bulk-ship begins.
- **F1** — Cedar-for-agents output must work with Pi's agent manifest format (verify upstream support; if absent, add a Pi-emitter to opsbench's generator).
- **F2** — `opsbench-gateway` exposes a Pi-native transport (likely the same MCP stdio/HTTP transport, but documentation leads with Pi connection examples).
- **F3** — Signed-receipt flow integrates with whatever audit surface Pi exposes; if Pi has a built-in receipt hook, use it.
- **F4** — Each team package's skills get authored as Pi-first; the existing team-incident-response is retrofitted in F5 (so F4 teams ship Pi-native from day one).

This pivot is acknowledged as a **scope multiplier on F0–F4** — every recipe and skill needs Pi-native primary docs. The cost is offset by the strategic positioning win: opsbench becomes the de facto ops toolkit for Pi users.

---

## F6 — Architectural evaluations & integrations

**Goal:** Decide opsbench's long-term relationship with three adjacent projects that could either compete with or compose with the F2 gateway.

### Order

1. **`agentgateway`** — Evaluate whether to fold opsbench-gateway INTO agentgateway (as a Cedar plugin) once agentgateway hits GA. Decision artifact: a design doc with relationship choice (`competes` / `composes` / `replaces`).
2. **`sympozium-ai/sympozium`** — Kubernetes-deployed multi-agent coordination layer. Evaluate: opsbench file-install + sympozium K8s-install as complementary deployments? Or opsbench's recipes consumed by sympozium agents?
3. **`falcosecurity/prempti`** — Runtime syscall enforcement under Cedar. Evaluate: bundle as default `post-tool-use` enforcement when running on Linux clusters?
4. **`scopeblind-gateway`** — We already adopt the receipt format in F3. Evaluate if the upstream is worth contributing to vs. forking long-term.

Each evaluation is a brainstorming pass + design doc; no implementation commitments until the design doc lands.

---

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| `cedar-policy/cedar-for-agents` (F1) is immature; breaking changes | Pin to a specific version; vendor the CLI binary in CI |
| Fork divergence from `stacklok/toolhive` (F2) | Document upstream-sync cadence; treat as monthly merge from upstream |
| Recipe rot — vendor MCPs evolve | F1's generator regenerates Cedar from recipes; recipe authors must keep tool lists fresh |
| Ed25519 key compromise (F3) | Key rotation script; receipt format includes signer fingerprint so old receipts stay verifiable across rotations |
| F4 team-package scope creep | Per-team brainstorming pass enforces single-spec discipline |

## How items move

- Each F-phase gets a brainstorming pass before its spec lands
- Each F-phase gets a writing-plans pass before its implementation
- Each F-phase ships as one or more PRs against `main`
- Roll-forward autonomy: after each F-phase merges, automatically start the next phase's brainstorming pass unless explicitly paused
- Per-phase specs live in `docs/superpowers/specs/<date>-f<n>-<slug>-design.md`
- Per-phase plans live in `docs/superpowers/plans/<date>-f<n>-<slug>-plan.md`

## Open questions for reviewer

- **F0 trim**: 30 vs 35 recipes? Bias toward "ship now" or "ship fewer with better Cedar gating examples"?
- **F2 vendoring**: vendor toolhive under `packages/opsbench-gateway/` vs. fork as a sibling repo. License says we can either way; team preference?
- **F4 ordering**: confirm `platform → security → network → data → IT`. Catalog ecosystem-maturity ranking supports this, but the original ROADMAP.md ordered `platform → data → security → network → IT`.
- **F6 prioritization**: `agentgateway` first vs. `prempti` first. agentgateway decides our long-term shape; prempti adds a security primitive sooner. Default: agentgateway first per the goal of locking down opsbench's architectural identity.
