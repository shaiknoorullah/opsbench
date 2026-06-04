# F4 — team-platform-engineering Package — Design

**Status:** draft 2026-06-04 — awaiting reviewer approval
**Author:** Claude Code session (Shaik Noorullah, driver)
**Parent roadmap:** [`./2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md) (see § "F4 — Team packages on the foundation", item 1)
**Sibling specs (foundation):**

- [`./2026-06-04-f1-design.md`](./2026-06-04-f1-design.md) — Cedar-for-agents generator. team-platform-engineering's allowlists flow through `tools-generated.cedar`.
- [`./2026-06-04-f2-design.md`](./2026-06-04-f2-design.md) — opsbench-gateway. Every recipe in this package points at the gateway by default.
- [`./2026-06-04-f3-design.md`](./2026-06-04-f3-design.md) — Signed receipts. Every IaC / GitOps action this package takes is sealed in `custody.log` with the F3 Ed25519 envelope.

**Inputs:**

- [`../research/2026-06-04-ecosystem-catalog.md`](../research/2026-06-04-ecosystem-catalog.md) — surfaced ~40 strong candidates across Terraform, Pulumi, Crossplane, Argo CD, Flux, Backstage, progressive-delivery, drift-detection, and env-promotion domains. Vendor-shipped MCPs from HashiCorp (Terraform), Akuity & argoproj-labs (Argo CD), Upbound (Crossplane), Heapy (Argo Workflows), controlplaneio-fluxcd (Flux), and Backstage make most of this package thin glue rather than greenfield.
- [`../specs/2026-06-04-multi-phase-execution-roadmap.md`](./2026-06-04-multi-phase-execution-roadmap.md) — P2's original `team-platform-engineering` outline (now superseded). The scope of this F4 spec is a direct lift-and-shift of that intent onto the F1/F2/F3 foundation.
- [`../specs/2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md) § "Pi-first multi-host" — every skill, agent, and recipe in this package is authored Pi-first.
- Existing patterns: [`packages/team-incident-response/`](../../packages/team-incident-response/) — directory layout, README shape, agent sub-team naming (`team-N-<role>`), skill SKILL.md frontmatter, JSON-schema draft-2020-12 conventions.

## 1. Purpose

team-platform-engineering is opsbench's second team package and the first one authored on top of the F0–F3 foundation. It exists for one operator persona: the platform engineer who owns the company's IaC + GitOps + progressive-delivery surface. That persona spends most of their day reading Terraform/Pulumi plans, watching Argo CD or Flux reconcile, hunting drift across N clusters, promoting changes between environments, and (when something goes wrong) rolling back without taking the platform down. Today they do this by stitching together vendor CLIs and tabs in the browser; opsbench gives them a single skill chain that reads from the *real* vendor MCPs (HashiCorp Terraform MCP, Akuity / argoproj-labs Argo CD MCPs, Upbound Crossplane MCPs, etc.) through the opsbench-gateway, with Cedar-evaluated least-privilege enforcement and signed receipts on every mutating call.

The package is intentionally **thin** because the heavy lifting has already shipped:

- **Cedar allowlists** are auto-generated from recipe `tools:` frontmatter via F1's `scripts/generate-cedar-policy.sh`. team-platform-engineering ships ~12 hand-written overrides, not 200 lines of per-agent rule files.
- **Routing + audit** runs in opsbench-gateway (F2). No recipe in this package re-implements MCP routing, redaction, or custody-log emission.
- **Tamper-evident audit** is the F3 signed-receipt envelope. Recovery / promotion / apply operations all produce signed receipts the operator can verify offline before any production rollout.
- **Vendor MCPs** are the substrate. We point at `hashicorp/terraform-mcp-server`, `akuity/argocd-mcp`, `argoproj-labs/mcp-for-argocd`, `Heapy/argo-workflows-mcp`, `controlplaneio-fluxcd/flux-operator`, `upbound/controlplane-mcp-server`, `upbound/marketplace-mcp-server`, `briferz/crossplane-mcp`. We do not re-implement what they already ship.

What this package *does* add, on top of those primitives:

1. **A canonical platform-engineer skill chain** — `iac-plan-review`, `gitops-promote`, `drift-reconcile`, `progressive-rollout-supervise`, `cluster-bootstrap-verify`, etc. — that composes the vendor MCPs into the workflows platform engineers actually run.
2. **DAG-of-DAGs sub-team layout** — orchestrator + specialists, mirroring team-incident-response's `team-N-<role>` convention. Each sub-team owns one phase of the platform-engineering lifecycle (Plan, Provision, Reconcile, Promote, Roll Back, Verify, Catalog, Loop Control).
3. **A small set of platform-specific JSON schemas** — plan envelopes, drift verdicts, promotion records, rollback receipts, bootstrap reports — so handoffs between sub-teams are typed, validated, and embeddable in F3 receipts.
4. **A trimmed Cedar policy file** that adds platform-specific hand-overrides (e.g. "applying a Terraform plan touching `aws_iam_*` resources requires `context.human_approval`") on top of the F1-generated baseline.
5. **A small hook set** that delegates to the foundation hooks but injects platform-engineer-specific PreToolUse gates (e.g. "any `terraform apply` against the `prod` workspace is auto-denied unless `gateway.yaml` says otherwise").
6. **A curated MCP-recipe subset** — cross-linked to the F0 catalog rather than duplicated — that lists the vendor MCPs platform engineers actually need: Terraform, Argo CD, Argo Workflows, Crossplane (vendor + community), Flux, Helm, Kubernetes (distro-agnostic + CLI bridge), Backstage, Pulumi, Atlas/Liquibase/Flyway (for schema-aware promotion), GitHub MCP.

The package's success criterion is simple: a platform engineer can install opsbench, set their Pi `AGENTS.md` to the platform-engineering profile, and replicate their typical Monday workflow (read drift, plan a fix, promote it through dev→stage→prod with gates) end-to-end inside the agent — with every mutating action gated by Cedar, every action emitting a signed F3 receipt, and zero surprise blast-radius.

## 2. Skill inventory

Target: 12 skills (within the F4 envelope of 8–15). Each skill ships an `SKILL.md` at `packages/team-platform-engineering/skills/<slug>/SKILL.md` with Pi-first frontmatter and a derived Claude Code variant produced by `tools/pi-compat-layer/adapt.sh` (F5).

| Skill slug | Purpose (one-liner) |
| ---------- | ------------------- |
| `platform-engineering-orchestrator` | Master skill — DAG-of-DAGs entry point; routes the operator's intent to the right sub-skill and threads the signed-receipt chain across the entire session. |
| `iac-plan-review` | Read a Terraform / Pulumi / Crossplane plan via the vendor MCP, classify changes (read-only / additive / mutating / destructive), surface human-approval-required operations, emit a typed `plan-envelope` artifact. |
| `iac-apply-supervise` | Drive a gated apply against the chosen IaC engine. Cedar must allow + (for `prod`-targeted plans) `context.human_approval == true`. Emits a signed `apply-receipt`. |
| `gitops-promote` | Move a manifest version from environment N → N+1 across Argo CD or Flux. Validates upstream sync state, checks for drift, performs the bump, watches rollout health, records the promotion as a typed `promotion-record`. |
| `drift-reconcile` | Detect drift between desired-state (Git / CRD) and actual cluster state via Argo CD / Flux / Crossplane MCPs; classify (benign / suspect / unauthorized); propose reconciliation plan; gate execution behind Cedar. |
| `progressive-rollout-supervise` | Watch a canary or blue/green promoted by Argo Rollouts / Flagger; correlate metrics from Grafana / Prometheus MCPs; abort + rollback on regression; emit `rollout-verdict`. |
| `cluster-bootstrap-verify` | Read-only audit of a fresh cluster's platform layer: CNI, ingress controller, storage class, service mesh, secrets engine, IaC controller. Produces `bootstrap-report` artifact for compliance hand-off. |
| `crossplane-composition-author` | Read existing XRDs / Compositions via Upbound MCPs, propose new Composition revisions, dry-run against a test claim, emit signed diff for review. Mutating writes blocked unless explicitly allowed. |
| `terraform-module-promote` | Move a private Terraform module version from a working branch to the registry's `latest` tag, after validating breaking changes, drift impact, and version-pin downstream consumers. |
| `backstage-catalog-sync` | Read / write Backstage catalog entries (Component / API / System / Resource) via the Backstage MCP. Reconciles drift between catalog-as-code (`catalog-info.yaml`) and the running cluster's actual state. |
| `secrets-bootstrap-and-rotate` | Drive HashiCorp Vault MCP (or Azure Key Vault MCP) flows for: bootstrap a new app, rotate a static secret, rotate a dynamic-DB credential, swap a PKI issuer. Every action requires human-approval Cedar context. |
| `rollback-orchestrator` | Coordinated rollback across IaC + GitOps + secrets layers. Reads the most recent set of signed apply-receipts, confirms a known-good state exists, executes inverse operations in safe order, verifies, emits a chained rollback receipt referencing the original. |

Each skill's SKILL.md follows the team-incident-response shape: `name`, `description`, `version`, `homepage`, optional `pi_manifest` block, `entry_prompt`, the prompt body, `allowed_tools` (the Cedar-gated subset for this skill), and `produces_artifacts` (the JSON-schema slugs in § 4). The orchestrator at the top binds the chain — its `entry_prompt` enumerates the operator's high-level options ("review a plan", "promote a release", "investigate drift", "supervise a rollout", "rollback") and dispatches.

The chain is meant to be runnable in any order — drift-reconcile can feed iac-plan-review which feeds iac-apply-supervise which feeds rollback-orchestrator — and each skill's output is an explicit typed artifact (§ 4) the next skill validates on input.

## 3. Agent inventory

Target: 14 agents organized into 6 sub-teams. The naming convention (`team-N-<role>`) follows team-incident-response exactly. Each agent ships at `packages/team-platform-engineering/agents/team-N-<role>/<agent>.md` with a frontmatter that includes a Cedar `allowed_tools` list (which F1's generator derives from each agent's invoked recipes' `tools:` frontmatter, not maintained by hand).

### Sub-team 1 — Command / coordination (2)

| Agent | Primary capability | Default tool allowlist (Cedar; generated from recipe `tools:` frontmatter) |
| ----- | ------------------ | --------------------------------------------------------------------------- |
| `platform-engineering-commander` | Outer-DAG orchestrator. Never mutates. Routes to specialist sub-teams. Threads the parent-receipt chain across calls. | Read-only across all surfaced MCPs: `terraform-mcp::*::read`, `argocd-mcp::*::read`, `flux-mcp::*::read`, `kubernetes-mcp::*::read`, `crossplane-mcp::*::read`. |
| `change-window-keeper` | Append-only window log: who-asked-for-what + when. Mirrors `timeline-keeper` from team-incident-response. Produces typed `window-entry` artifacts (extension of the timeline-entry schema). | None — fully internal, writes only to `$WORKDIR/window.jsonl`. |

### Sub-team 2 — Plan / IaC read (3)

| Agent | Primary capability | Default tool allowlist |
| ----- | ------------------ | ---------------------- |
| `terraform-plan-reader` | Read Terraform / HCP plans via `hashicorp/terraform-mcp-server`. Classifies resources by blast-radius. Emits `plan-envelope`. | `terraform-mcp::plan::read`, `terraform-mcp::workspace::read`, `terraform-mcp::registry::read`. |
| `pulumi-plan-reader` | Same shape, Pulumi `preview` instead of Terraform `plan`. Currently wraps the Pulumi CLI via CLI-Anything (no vendor MCP at time of writing). | `pulumi-cli-anything::preview`, `pulumi-cli-anything::stack-output::read`. |
| `crossplane-plan-reader` | Read Crossplane XRDs / Compositions / Claims via Upbound vendor MCPs and `briferz/crossplane-mcp`. Emits the same `plan-envelope` shape for parity. | `crossplane-mcp::*::read`, `upbound-controlplane-mcp::compositions::read`, `upbound-marketplace-mcp::packages::read`. |

### Sub-team 3 — Provision / Apply gates (3)

| Agent | Primary capability | Default tool allowlist |
| ----- | ------------------ | ---------------------- |
| `iac-apply-gatekeeper` | Cedar-gated `apply` driver. Reads `plan-envelope`, evaluates against per-environment policy (`tools.cedar` + `tools-generated.cedar`), requires `human_approval` for any `prod`-tagged plan. | `terraform-mcp::plan::apply`, `pulumi-cli-anything::up`, `crossplane-mcp::claims::create` (all gated to `Allow` only when `context.human_approval == true` for `prod`). |
| `gitops-promotion-driver` | Drive Argo CD / Flux promotion via `argocd-mcp` / `argocd-akuity-mcp` / `flux-mcp`. Emits `promotion-record`. | `argocd-mcp::application::sync`, `argocd-mcp::application::write`, `flux-mcp::kustomization::reconcile`, gated identically. |
| `crossplane-composition-applier` | Mutating writer for XRD / Composition revisions via Upbound MCPs. Always requires explicit `Allow` from per-environment Cedar rule. | `upbound-controlplane-mcp::compositions::write`, gated by `context.environment` and `context.human_approval`. |

### Sub-team 4 — Reconcile / Drift (2)

| Agent | Primary capability | Default tool allowlist |
| ----- | ------------------ | ---------------------- |
| `drift-detector` | Read-only diff between desired-state (Git / CRD) and actual state. Pulls from Argo CD, Flux, and the Kubernetes MCP. Classifies (benign / suspect / unauthorized). | `argocd-mcp::application::diff`, `flux-mcp::*::status`, `kubernetes-mcp::*::read`. |
| `drift-reconciler` | Plan + execute drift remediation. Cedar-gated. Each remediation step produces its own signed receipt; reconciliation set referenced by a parent `drift-verdict`. | `argocd-mcp::application::sync`, `flux-mcp::*::reconcile`, gated. |

### Sub-team 5 — Progressive delivery / Rollout supervision (2)

| Agent | Primary capability | Default tool allowlist |
| ----- | ------------------ | ---------------------- |
| `rollout-supervisor` | Watch Argo Rollouts / Flagger canary or blue/green progression. Correlates against Grafana MCP / Prometheus MCP for health signals. Decides "promote next step" / "hold" / "abort + rollback". | `argocd-mcp::rollout::read`, `flux-mcp::canary::read`, `grafana-mcp::query`, `prometheus-mcp::query`. |
| `rollback-executor` | Performs the inverse op chain when `rollout-supervisor` says abort. Reads the most recent apply-receipt set; verifies the original signed envelopes (F3); executes inverse ops. Emits chained `rollback-receipt`. | `argocd-mcp::application::rollback`, `flux-mcp::*::suspend`, `terraform-mcp::workspace::run-rollback`. |

### Sub-team 6 — Catalog / verification (2)

| Agent | Primary capability | Default tool allowlist |
| ----- | ------------------ | ---------------------- |
| `backstage-catalog-reconciler` | Drives Backstage MCP. Reads `catalog-info.yaml` from Git, queries the running cluster, surfaces the diff, optionally applies catalog corrections (always gated). | `backstage-mcp::catalog::read`, `backstage-mcp::catalog::write` (gated to `Allow` only for non-production catalog refs). |
| `bootstrap-verifier` | Read-only audit of a new cluster's platform layer (CNI / ingress / storage / mesh / secrets / IaC controller). Output: `bootstrap-report`. | `kubernetes-mcp::*::read`, `helm-mcp::list`, `kubescape-mcp::scan` (read-only), `trivy-mcp::scan` (read-only). |

That's 14 agents across 6 sub-teams, mirroring the team-incident-response cadence (33 across 8) at a smaller scale because this team's surface is narrower. Future expansion (e.g. a dedicated `backup-promote` sub-team that overlaps with team-data-platform) is held to F4-N or later.

## 4. Schemas

Target: 5 JSON schemas at `packages/team-platform-engineering/schemas/`. All draft 2020-12, all `additionalProperties: false` at the top level, all designed to embed verbatim inside an F3 signed receipt's `context` field (so `args_sha256` covers them deterministically).

| Schema file | Shape (what it types) |
| ----------- | --------------------- |
| `plan-envelope.schema.json` | Output of any `*-plan-reader` agent. Fields: `engine` (`terraform` / `pulumi` / `crossplane`), `workspace_id`, `environment` (`dev` / `stage` / `prod` / freeform), `plan_sha256` (the canonical plan hash from the upstream MCP), `summary` (counts of additive / destructive / sensitive resource changes), `classified_changes[]` (per-resource: `action`, `address`, `blast_radius_class`, `requires_human_approval`), `policy_files[]` (Cedar files that will gate the apply), `generated_at`. The envelope is what `iac-apply-gatekeeper` consumes and what the operator reads before approving. |
| `promotion-record.schema.json` | Output of `gitops-promotion-driver`. Fields: `from_environment`, `to_environment`, `target_kind` (`argocd-application` / `flux-kustomization` / `flux-helmrelease`), `target_id`, `revision_from`, `revision_to`, `sync_strategy`, `health_window` (start / end + `latency_p95_ms`, `error_rate`, `slo_burned_pct`), `gate_decision` (`promoted` / `held` / `aborted`), `gate_reason`, `parent_plan_envelope_sha256` (chain link). |
| `drift-verdict.schema.json` | Output of `drift-detector`. Fields: `scope` (`cluster_id`, `namespace_glob`, `kind_filter`), `desired_state_ref` (Git URL + commit SHA), `actual_state_snapshot_sha256`, `drift_entries[]` (per-resource: `kind`, `name`, `field_path`, `desired_value_sha256`, `actual_value_sha256`, `classification` `benign|suspect|unauthorized`),`verdict`(`no-drift` / `acceptable` / `requires-reconcile` / `requires-investigation`),`recommended_action`. Feeds into`drift-reconciler`. |
| `rollback-receipt.schema.json` | Output of `rollback-executor`. Extends the F3 receipt envelope: `original_apply_receipts_sha256[]` (the chain of receipts being inverted), `inverse_ops[]` (one per original op, with its own decision + receipt SHA), `verified_at`, `health_after` (Grafana / Prometheus snapshot SHAs), `next_action` (`done` / `escalate` / `partial-success`). Designed so the verifier (F3 § 3.7) can prove the rollback inverted exactly the set claimed. |
| `bootstrap-report.schema.json` | Output of `bootstrap-verifier`. Fields: `cluster_id`, `cluster_distro` (`eks` / `aks` / `gke` / `vanilla` / `talos` / `k3s` / …), `cni_plugin`, `cni_version`, `ingress_controller`, `ingress_version`, `default_storage_class`, `service_mesh` (or `none`), `secrets_engine`, `iac_controller`, `policy_engine` (Kyverno / OPA-Gatekeeper / none), `findings[]` (severity / category / description / suggested_fix), `compliance_posture_summary`, `generated_at`. |

Optional (held to F4-N): `composition-revision.schema.json` (Crossplane), `module-promotion.schema.json` (Terraform module bump record), `vault-rotation.schema.json` (secrets rotation chain). These are nice-to-have but not on the critical path for the package's first ship. Adding them is a non-breaking forward extension because every consumer of the existing five reads explicit field names rather than positional or unioned shapes.

Validation strategy: a small CI job (`platform-engineering-validate-schemas`) compiles each schema with `ajv compile` and asserts a fixture per schema validates. Schemas live next to the agents that emit them so the producer / consumer / fixture sit in one place.

## 5. MCP recipes

Recipes are **curated cross-links** to the F0 catalog, *not* duplicated. The package ships a small `mcp-recipes/INDEX.md` that lists the recipes platform engineers care about with a one-line role + a relative link back to `packages/team-incident-response/mcp-recipes/<file>` (F0's canonical recipe directory). F4 does *not* fork or copy recipes — F1's generator already reads from the canonical location, and duplicating recipes here would fragment the Cedar generation contract.

| Role | Recipe (in `packages/team-incident-response/mcp-recipes/`) | Why this team uses it |
| ---- | ---------------------------------------------------------- | --------------------- |
| IaC core (read + apply) | `terraform-mcp.md` | Vendor MCP. The substrate for every Terraform skill. |
| IaC alt | `awslabs-mcp.md`, `gcloud-mcp.md`, `microsoft-mcp.md`, `azure-mcp.md` | Cloud-vendor MCPs surface the underlying resources Terraform writes to; useful for drift detection on the cloud side. |
| GitOps (Argo) | `argocd-mcp.md`, `argocd-akuity-mcp.md`, `argo-workflows-mcp.md` | Two Argo CD MCPs (argoproj-labs + Akuity) coexist; this package routes based on `gateway.yaml#upstreams[].profile`. Argo Workflows is for promotion automation. |
| GitOps (Flux) | `flux-mcp.md` | External-only (AGPL-3.0); we never vendor it. The recipe documents the gateway-proxy connection path. |
| Composition | `crossplane-mcp.md`, `crossplane-control-plane-mcp.md`, `crossplane-marketplace-mcp.md` | Read-only community + vendor CRUD + vendor marketplace. Vendor (Upbound) is the canonical surface for mutating ops. |
| Cluster ops | `kubernetes-mcp.md`, `kubernetes-cli-bridge-mcp.md`, `helm-mcp.md`, `talos-mcp.md` | Distro-agnostic + CLI bridge for read-write parity + Helm + Talos for bare-metal clusters. |
| Observability for rollouts | `grafana-mcp.md`, `prometheus-mcp.md`, `loki-mcp.md`, `signoz-mcp.md`, `otel-mcp.md`, `victoriametrics-mcp.md`, `alertmanager-mcp.md` | Rollout supervisor reads from whichever stack the operator runs. Cross-listed (not duplicated). |
| Security / posture | `kubescape-mcp.md`, `trivy-mcp.md` | Bootstrap verifier reads scan results read-only. |
| Source / change tracking | `github-mcp.md` | Read PRs / commits referenced by plan envelopes; correlate promotions back to source. |
| Secrets | `vault-mcp.md` | Drives `secrets-bootstrap-and-rotate`. Strictly gated. |
| Foundation | `cedar-for-agents-reference.md` | Reference link for how Cedar policies in this package are generated. |

team-platform-engineering also ships **two recipes uniquely owned by this package**, because they did not fit the F0 bulk-ship's incident-response framing:

| Recipe (new, owned here) | Upstream | License | Notes |
| ------------------------ | -------- | ------- | ----- |
| `backstage-mcp.md` | `backstage/backstage` (community MCP, multiple candidates) | Apache-2.0 | Catalog read + write. Authoritative recipe for `backstage-catalog-reconciler`. |
| `pulumi-cli-anything.md` | `HKUDS/CLI-Anything` wrap of `pulumi-cli` | (verify) | Pulumi has no first-party MCP at time of writing; the recipe documents the CLI-Anything wrapping path per the parent roadmap's Pi-first authoring rule. |

These two land in `packages/team-platform-engineering/mcp-recipes/` (the only recipes in this package's own directory). All other recipes are cross-links in the INDEX.

Pi-first authoring rule applies to both new recipes: each ships a Pi `AGENTS.md` snippet first (either pointing at the gateway URL when a vendor MCP exists, or invoking a CLI-Anything-wrapped CLI when no MCP exists), with the Claude Code `mcpServers` JSONC block as the secondary configuration.

## 6. Cedar policy posture

Tiny. Most rules flow through `tools-generated.cedar` (F1) which the generator builds from each recipe's `tools:` frontmatter — F4 doesn't reauthor that file.

What this package owns at `packages/team-platform-engineering/policies/`:

- **`platform-engineering.cedar`** — hand-overrides specific to platform engineering. Expected size: ~80–120 lines.
- **`constitution.md`** — the team's high-level posture (mirrors team-incident-response's constitution): "default read-only", "every mutating op requires Cedar `Allow`", "every `prod`-tagged context requires `human_approval == true`", "rollback ops require the original receipt chain to be verifiable", "secrets ops always require `human_approval`".

The hand-overrides cover the following non-generated rules:

| Rule | Reason it must be hand-written (not generated) |
| ---- | ---------------------------------------------- |
| `forbid` any `terraform-mcp::plan::apply` whose `context.workspace_tags` contains `"prod"` when `context.human_approval != true`. | The generator only knows the recipe's tool list; it does not encode environment-conditional rules. |
| `forbid` any `argocd-mcp::application::sync` against an Application whose `context.target_namespace` matches a `prod-*` pattern unless `context.gate_record_signature_verified == true`. | Couples the F3 receipt chain to the apply decision — the signing module verifies an upstream gate signature before allow. |
| `forbid` any `upbound-controlplane-mcp::compositions::write` outside an `Action::"opsbench::composition::author"` context. | Mutating Compositions is reserved for `crossplane-composition-applier`; even other agents in this package cannot do it. |
| `forbid` any `vault-mcp::*::write` unless `context.human_approval == true && context.rotation_reason in {"scheduled","manual-after-leak","emergency"}`. | Vault writes always need a stated reason and human approval. Generator can't enforce reason enums. |
| `forbid` any `backstage-mcp::catalog::write` when `context.target_namespace == "production-catalog"`. | The production catalog is canonical; mutations come from PRs, not from agents. |
| `forbid` `flux-mcp::source::write` and `flux-mcp::kustomization::write` for everyone except `gitops-promotion-driver` and `rollback-executor`. | Per-agent allowlist; the generator emits the broader allowlist but the operator restriction is hand-encoded. |
| `permit` the `rollback-executor` to invert any previously-allowed apply *only* when the original receipt set is verifiable (F3) and `context.health_signal_severity >= "critical"`. | Couples authorization to F3 receipt verification result. |
| `permit` the `bootstrap-verifier` to read across *all* read-only tool actions globally (it audits cluster posture; the breadth is intentional). | Generator's per-skill scoping would over-restrict it. |
| `forbid` mutating Crossplane CRD operations whenever `context.target_cluster_id` is the management cluster (the meta-cluster), unless an explicit `Action::"opsbench::management-cluster-override"` is granted. | Prevents agents from accidentally writing to the management plane. |

Generated rules (`tools-generated.cedar`) handle the bulk: each agent's `allowed_tools` from § 3 is converted to Cedar `permit` clauses scoped to that principal. The hand-written file only contains `forbid` overrides + the cross-cutting `permit` for `bootstrap-verifier`.

Per the F1 contract, the generator runs as part of the package's `prepare` script. Re-running the generator never overwrites the hand-written `platform-engineering.cedar`. The CI `validate-cedar` job validates both files together against the schema and rejects PRs where the hand file overlaps a generated rule in conflicting ways.

## 7. Hooks

The foundation hooks (`packages/team-incident-response/hooks/{pre,post}-tool-use.sh`, `session-start.sh`, `subagent-stop.sh`) do almost everything: PreToolUse gates by Cedar, PostToolUse seals with F3 signed receipts, SessionStart bootstraps the custody log, SubagentStop closes out the chain.

team-platform-engineering ships **three small platform-specific hooks** under `packages/team-platform-engineering/hooks/`. Each is a one-screen Bash script that delegates to the foundation hook after enforcing one platform-engineering-specific invariant:

| Hook | What it adds on top of the foundation |
| ---- | ------------------------------------- |
| `pre-tool-use-iac.sh` | Wraps the foundation's `pre-tool-use.sh`. Before delegating: if the requested tool is in `{terraform-mcp::plan::apply, pulumi-cli-anything::up, crossplane-mcp::claims::create}` and the input event's `context.environment == "prod"`, the hook checks `$INCIDENT_DIR/window.jsonl` for an active change window opened by `change-window-keeper`. No window → deny with `denied:no-change-window`. |
| `pre-tool-use-promote.sh` | Same wrapping pattern. For any `gitops-promotion-driver` event, the hook verifies the immediately-preceding `plan-envelope.json` has been written and is referenced by `parent_plan_envelope_sha256` in the promotion. Missing reference → deny with `denied:promotion-without-plan`. |
| `pre-tool-use-rollback.sh` | For any `rollback-executor` event, runs `scripts/verify-receipts.sh` (F3 § 3.7) against the referenced `original_apply_receipts_sha256[]`. Verifier failure → deny with `denied:rollback-receipt-chain-invalid`. |

Each hook is wired in via `gateway.yaml#hooks.pre_tool_use` ordering: the platform hook runs first; on `allow` it delegates to the foundation hook. The hooks must remain idempotent and side-effect-free except for the `window.jsonl` append in the change-window case. Hooks emit their own `denied:*` reason into the F3 receipt's `deny_reason` field so the audit log captures the platform-engineering-specific cause.

PostToolUse and SubagentStop hooks are **not overridden** — the foundation hooks already produce the F3 signed envelope, which is what we want.

## 8. Directory layout

```text
packages/team-platform-engineering/
├── README.md
├── package.json
├── teams/
│   ├── team-1-command.md
│   ├── team-2-plan.md
│   ├── team-3-provision.md
│   ├── team-4-reconcile.md
│   ├── team-5-rollout.md
│   └── team-6-catalog.md
├── skills/
│   ├── platform-engineering-orchestrator/SKILL.md
│   ├── iac-plan-review/SKILL.md
│   ├── iac-apply-supervise/SKILL.md
│   ├── gitops-promote/SKILL.md
│   ├── drift-reconcile/SKILL.md
│   ├── progressive-rollout-supervise/SKILL.md
│   ├── cluster-bootstrap-verify/SKILL.md
│   ├── crossplane-composition-author/SKILL.md
│   ├── terraform-module-promote/SKILL.md
│   ├── backstage-catalog-sync/SKILL.md
│   ├── secrets-bootstrap-and-rotate/SKILL.md
│   └── rollback-orchestrator/SKILL.md
├── agents/
│   ├── team-1-command/
│   │   ├── platform-engineering-commander.md
│   │   └── change-window-keeper.md
│   ├── team-2-plan/
│   │   ├── terraform-plan-reader.md
│   │   ├── pulumi-plan-reader.md
│   │   └── crossplane-plan-reader.md
│   ├── team-3-provision/
│   │   ├── iac-apply-gatekeeper.md
│   │   ├── gitops-promotion-driver.md
│   │   └── crossplane-composition-applier.md
│   ├── team-4-reconcile/
│   │   ├── drift-detector.md
│   │   └── drift-reconciler.md
│   ├── team-5-rollout/
│   │   ├── rollout-supervisor.md
│   │   └── rollback-executor.md
│   └── team-6-catalog/
│       ├── backstage-catalog-reconciler.md
│       └── bootstrap-verifier.md
├── schemas/
│   ├── plan-envelope.schema.json
│   ├── promotion-record.schema.json
│   ├── drift-verdict.schema.json
│   ├── rollback-receipt.schema.json
│   └── bootstrap-report.schema.json
├── policies/
│   ├── constitution.md
│   └── platform-engineering.cedar
├── hooks/
│   ├── pre-tool-use-iac.sh
│   ├── pre-tool-use-promote.sh
│   └── pre-tool-use-rollback.sh
└── mcp-recipes/
    ├── INDEX.md
    ├── backstage-mcp.md
    └── pulumi-cli-anything.md
```

That is the full target directory. Cross-link recipes from `packages/team-incident-response/mcp-recipes/` appear in `INDEX.md` only.

## 9. Pi-first authoring notes

Every skill, agent, and the two owned recipes ship a Pi-first variant *first*, with Claude Code (and other hosts via F5) derived from the Pi form. Authoring rules per the parent roadmap's "Pi (pi.dev) — critical context for Pi-first authoring":

**Skills:**

- Pi `AGENTS.md` snippets live as `pi_manifest:` blocks in the SKILL.md frontmatter, so `tools/pi-compat-layer/adapt.sh` (F5) can emit them directly.
- Every skill's primary configuration block (the one developers copy-paste) is Pi. The Claude Code `mcpServers` JSONC block is labelled "Configuration — Claude Code (secondary)".
- For each recipe a skill calls, the Pi block points at the opsbench-gateway URL: `gateway_url: http://localhost:8765/mcp/<upstream-id>`. Skills do not configure upstream MCPs directly — they configure the gateway, which configures upstreams.

**Agents:**

- Frontmatter uses the same `pi_manifest:` shape. The `entry_prompt` is Pi-flavoured (no Claude-specific terminology like "subagent" — Pi calls them "child agents"; the adapter translates).
- Allowed tools are listed by their fully-qualified Cedar action name (`<recipe-id>::<tool>::<action>`). The F1 generator parses this and emits the corresponding Cedar `permit` clause.

**Recipes owned by this package (`backstage-mcp.md`, `pulumi-cli-anything.md`):**

- `backstage-mcp.md` lead with the Pi `AGENTS.md` configuration pointing at the gateway URL fronting the Backstage MCP upstream. Claude Code's `mcpServers` block is secondary.
- `pulumi-cli-anything.md` follows the parent roadmap's CLI-Anything wrap path: "Use HKUDS/CLI-Anything to generate a Pi-callable CLI from the Pulumi source; install via `pi install git:github.com/<your-fork>/pulumi-pi-skill`." Then document Pi `AGENTS.md` / `SYSTEM.md` instructions that direct the agent to call the wrapper CLI. The Claude Code variant in the same recipe documents how to expose the same wrapper via `tools/claude-code-compat-layer/`.

**Cross-host parity stubs:** Per parent roadmap, "other hosts (Codex, Copilot, Cursor, Gemini, OpenCode) get a one-line 'See tools/<host>-compat-layer/' pointer; full configs ship in F5." This package follows that rule — every skill/agent SKILL.md and the two owned recipes link to the compat-layer directory rather than inlining configurations for those hosts.

**Pi marketplace registration:** the package's `README.md` includes the standard Pi marketplace badge + install command (`pi install npm:@opsbench/team-platform-engineering`) — the registration itself is F5 work, but the documentation lands here so it's reviewable in the F4 PR.

## 10. Foundation integration matrix

How the package consumes F1/F2/F3:

| Foundation surface | How team-platform-engineering uses it |
| ------------------ | -------------------------------------- |
| F1 — `scripts/generate-cedar-policy.sh` | Each recipe's `tools:` frontmatter feeds the generator. `tools-generated.cedar` regenerates on `prepare`. The hand-written `platform-engineering.cedar` is the override-only layer per § 6. CI `validate-cedar` covers both files. |
| F2 — opsbench-gateway | Every recipe configuration block leads with the gateway URL. The package's `gateway.yaml` template lives at `packages/team-platform-engineering/gateway.yaml.template` and pre-configures the upstreams from § 5. Hooks delegate to the gateway's PreToolUse / PostToolUse contracts after running platform-specific invariants. |
| F3 — Signed receipts | Every mutating skill produces a typed artifact (§ 4) that becomes the `context` block of the receipt. The `rollback-orchestrator` skill verifies the original receipts via `scripts/verify-receipts.sh` before executing any inverse op. `plan-envelope.json`, `promotion-record.json`, `drift-verdict.json`, `rollback-receipt.json`, `bootstrap-report.json` all embed cleanly inside F3's canonical-JSON form. |
| F3 — parent_receipt_sha256 chain | The skill chain is designed so each downstream skill's first action's `parent_receipt_sha256` points at the upstream skill's final receipt. The orchestrator threads this automatically. |

## 11. Out of scope (this team package, not this phase)

- **Distributed Terraform state coordination.** State locking and remote-backend orchestration are the operator's responsibility (TFE / Atlantis / Spacelift). team-platform-engineering reads / writes through the vendor MCP and respects whatever state backend is configured upstream; it does not re-implement coordination.
- **Custom progressive-delivery controllers.** We point at Argo Rollouts and Flagger via their respective MCPs but do not author new strategies (canary maths, traffic-shaping algorithms). Authoring strategies stays in the operator's GitOps repo.
- **Secrets storage choice.** The recipe set offers Vault as the canonical secrets engine and Azure Key Vault / Google Secret Manager as alt paths. The package does not mandate one; the `secrets-bootstrap-and-rotate` skill dispatches by configuration.
- **Backstage plugin authoring.** We consume the Backstage MCP read/write surface. Authoring Backstage plugins or templates is operator-side work.
- **Cluster lifecycle (creation / deletion).** Bootstrap *verification* is in-scope (`bootstrap-verifier`). Cluster creation is out of scope (that's `team-data-platform` or a future `team-cluster-fleet` package).
- **IaC linting / static analysis.** Tools like `tfsec`, `checkov`, `kics` are surfaced via the Trivy MCP for IaC scanning; we do not re-implement the scan logic.
- **CI/CD pipeline authoring.** GitHub Actions / GitLab CI / Argo Events workflows are operator-owned. We read them via the GitHub MCP and Argo Workflows MCP but do not author them.
- **Cross-team escalation.** When a platform engineering action requires security review (e.g. a Composition change that touches secrets), the orchestrator emits a typed handoff artifact; cross-team routing is foundation work (gateway routes), not team-package work.
- **Cost analysis.** FinOps / cost-impact for proposed plans is interesting but not in F4's scope. Held to a future team package (`team-finops`).

## 12. Acceptance criteria

The package ships when all of the following hold:

1. **Directory layout matches § 8 exactly.** Every file path enumerated above exists. `packages/team-platform-engineering/` is a valid npm subpackage (`package.json` present, name `@opsbench/team-platform-engineering`).
2. **Skills.** 12 SKILL.md files in `skills/`, each with valid frontmatter (validated by the existing `lint:skills` job). Each skill enumerates its `produces_artifacts` (the schema slugs from § 4) and its `allowed_tools` (Cedar-action-qualified names). Each has a Pi `pi_manifest:` block.
3. **Agents.** 14 agent files across 6 sub-team directories; frontmatter validates; each agent's `allowed_tools` resolves to actions present in at least one recipe's `tools:` frontmatter (the F1 generator's input contract).
4. **Schemas.** 5 JSON schema files; each compiles with `ajv compile`; each has a fixture in `schemas/fixtures/<slug>.json` that validates. The `platform-engineering-validate-schemas` CI job runs `ajv validate` against each fixture and fails on any error.
5. **Cedar.**
   - `policies/platform-engineering.cedar` parses with `cedar validate` and contains all 9 hand-rules from § 6.
   - `tools-generated.cedar` is regenerated cleanly from the package's `tools:` frontmatter via F1's generator (`scripts/generate-cedar-policy.sh --package team-platform-engineering`). The output is gitignored.
   - The combined policy set evaluates correctly against a fixture authorization request per schema in `policies/fixtures/<slug>.json`.
6. **Hooks.** Three hooks present; each is a Bash file with the `set -euo pipefail` preamble; each delegates to the foundation hook on the happy path; each emits a `denied:*` reason on the unhappy path that is captured in the F3 receipt's `deny_reason`. Integration test in CI runs each unhappy-path scenario against a fixture event and asserts `deny_reason` matches.
7. **Recipes.**
   - `mcp-recipes/INDEX.md` enumerates every cross-link from § 5 with a relative path that resolves on disk.
   - `backstage-mcp.md` and `pulumi-cli-anything.md` exist as Pi-first recipes; each has a `tools:` frontmatter block; each has a "Configuration — Pi (primary)" section and a "Configuration — Claude Code (secondary)" section; each has a "See tools/<host>-compat-layer/" pointer for other hosts.
8. **README.** `packages/team-platform-engineering/README.md` mirrors the team-incident-response README shape: resource counts table, architecture diagram, sub-team list with agents, skill list with one-liners, foundation-integration note (F1/F2/F3), Pi marketplace install line.
9. **Foundation integration.**
   - `gateway.yaml.template` configures every upstream from § 5 (terraform, argocd, flux, crossplane, k8s, helm, backstage, vault, github, grafana, prometheus). The template uses `${OPSBENCH_GATEWAY_URL}` and `${UPSTREAM_*}` env-var placeholders.
   - Every mutating skill's example invocation (in its SKILL.md) shows the F3 receipt that gets emitted (in a code block, validated as v2 JSON).
   - The `rollback-orchestrator` skill's prompt includes the explicit `scripts/verify-receipts.sh` invocation step.
10. **CI.**
    - `platform-engineering-validate` workflow runs on every PR touching `packages/team-platform-engineering/**`. It runs: schema compilation + fixture validation; SKILL.md + agent frontmatter lint; Cedar parse + fixture eval; recipe `tools:` frontmatter presence check; markdown lint; spell check.
    - One end-to-end smoke test runs the orchestrator skill against a stubbed gateway and asserts an F3 receipt is produced for each mutating step.
11. **PR shape.** Per parent roadmap "F4 — Team packages on the foundation", "One PR per team". The package lands as a single PR titled `feat(team-platform-engineering): F4 ship platform engineering team package on F1/F2/F3 foundation`. The PR description references this design doc and the F1/F2/F3 design docs.
12. **No new dependencies in the foundation.** This package adds no new requirements to F1/F2/F3 / opsbench-gateway. If a feature needs a foundation change, it's deferred to F4-N+1 or to a foundation patch PR ahead of F4.
13. **Backwards compatibility with team-incident-response.** Recipes shared between teams (e.g. `github-mcp.md`, `kubernetes-mcp.md`) remain in their canonical location under team-incident-response. The cross-link in this package's INDEX.md must resolve. No recipe is moved or renamed by this PR.

## 13. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Vendor MCP surface changes (HashiCorp / Akuity / Upbound / Flux team ship a breaking version mid-sprint) | Medium | High | Pin every recipe to a specific upstream version in its `tools:` frontmatter; F1's generator emits Cedar rules scoped to that version. Recipes carry an "Upgrading from version X.Y" section so the operator knows the contract. CI runs `mcp:resolve-vendor-versions` weekly and opens dependabot-style PRs. |
| Two Argo CD MCPs (argoproj-labs + Akuity) drift in capability | High | Medium | The package supports both via `gateway.yaml#upstreams[].profile`. Skills query the gateway for which profile is active and adapt their tool calls accordingly. We do *not* mandate one over the other; that's an operator choice. The recipes document the divergence honestly. |
| Pulumi has no first-party MCP; CLI-Anything wrapper drifts from Pulumi's CLI version | Medium | Medium | The wrapper recipe pins the Pulumi CLI version explicitly. CI runs the wrapper against the pinned version. When Pulumi ships a first-party MCP we deprecate the wrapper. |
| Cedar policy explosion as the team's surface grows (more agents, more recipes) | Medium | Medium | F1's generator already handles this for the bulk. The hand-written file is rate-limited to 9 overrides per § 6; any new override requires a brainstorming pass in a follow-up F4-N PR, not a stealth addition. |
| Promotion records reference revisions that get force-pushed (Git history rewritten) | Low | High | `promotion-record.schema.json` stores `revision_from` and `revision_to` as commit SHA + a `revision_signature_sha256` field (signed receipt of the original PR/CI state). Force-push invalidates the SHA, the verifier flags it. The runbook documents the response (escalate to security review). |
| Drift detection produces too many false positives in busy clusters | High | Low | `drift-verdict.schema.json` includes a `classification` enum (`benign` / `suspect` / `unauthorized`). The drift-detector ships with a starter set of "benign" allowlists (e.g. controller-modified annotations, HPA replica counts). Operators can extend via `gateway.yaml#hooks.drift_allowlist`. |
| Rollback executor inverts the wrong receipts (chain confused across overlapping changes) | Low | Critical | `rollback-receipt.schema.json` requires explicit `original_apply_receipts_sha256[]`; the executor's prompt is structured so the operator must confirm the list before any inverse op runs. The pre-tool-use-rollback hook re-verifies signatures. |
| Backstage MCP candidates are community-only and quality varies | Medium | Medium | The `backstage-mcp.md` recipe picks the highest-quality candidate at time of writing and documents the candidate landscape. If the chosen candidate becomes unmaintained, the recipe lists fallbacks ranked by activity. |
| Secrets-rotation skill triggers a real Vault rotation in a test environment that wasn't configured for it | Low | Critical | Cedar forbids `vault-mcp::*::write` outside of `context.human_approval == true && context.rotation_reason in {...}`. The pre-tool-use hook also checks for an explicit `VAULT_ROTATION_ALLOWED=1` env var on the gateway. Two gates by design. |
| Schema additions in F4-N break consumers of v1 fixtures | Low | Medium | All schemas are draft-2020-12 with `additionalProperties: false`. Adding a field requires a versioned schema file (e.g. `plan-envelope.v2.schema.json`). The skill that emits the new shape advertises the version in its frontmatter so the consumer can pick. |
| Pi marketplace registration delayed beyond F5 | Low | Low | The README's marketplace install line documents the eventual path (`pi install npm:@opsbench/team-platform-engineering`); if registration slips, the line reverts to `pi install git:github.com/shaiknoorullah/opsbench` until registration lands. |
| Cross-team recipe cross-links break if team-incident-response reorganizes its `mcp-recipes/` directory | Medium | Medium | The INDEX.md uses relative paths. CI job `validate-cross-links` runs on every PR touching either team package and fails if any link resolves to a non-existent path. Cross-team reorgs require a coordinated PR pair. |
| Author of this package introduces a new hook that subtly bypasses the F3 signing path | Low | Critical | The PostToolUse hook is explicitly *not* overridden by this package. The pre-tool-use hooks delegate to the foundation hook for the actual mutating call. CI integration test asserts every mutating op in the smoke test emits a v2-schema receipt. |

## 14. Open questions for reviewer

1. **Skill count: 12 vs trim to 10.** § 2 lists 12 skills. The `terraform-module-promote` and `crossplane-composition-author` skills could plausibly be deferred to F4-N if reviewer prefers a tighter first ship. The 12-skill set covers the persona's full Monday workflow; the 10-skill trim covers "the things every platform engineer does at least weekly". Reviewer's call.
2. **Sub-team naming: `team-N-<role>` vs `subteam-<role>`.** Mirroring team-incident-response uses the former. team-incident-response's convention came from the v1.x days when "team" was the surface concept. team-platform-engineering inherits the convention by default, but if reviewer wants to take F4 as an opportunity to switch to `subteam-<role>` (clearer English), now is the moment.
3. **Should `rollback-orchestrator` be its own skill or a top-level mode of `iac-apply-supervise`?** § 2 lists it as standalone. The argument for folding it in: rollback always inverts a prior apply, so they share state. The argument against (and the current default): rollback's input contract is the F3 receipt chain, not a plan envelope — distinct enough to be a distinct skill.
4. **Hook delegation order: platform-specific first vs foundation first.** § 7 says platform hook runs first, then delegates to the foundation hook on allow. The alternative (foundation first, then platform) gives the foundation hooks last-word veto, which is more conservative. Default is platform-first because the platform invariants are stricter (no change window → deny) — but if reviewer prefers foundation-first, we flip it and document the change.
5. **Where does `pulumi-cli-anything.md` live long-term?** § 5 puts it in this package. Once Pulumi ships an official MCP, do we move the recipe up to F0's canonical directory? Default: yes, with a deprecation banner pointing to the official path. Reviewer may want a hard cutover instead.
6. **Backstage MCP candidate selection.** Several community candidates exist (Spotify-internal-fork, multiple community wrappers). The recipe needs to pick one canonically. Default: the most-active candidate at PR time. Reviewer may want a more rigorous evaluation pass (e.g. compare 3 candidates side by side, document the rationale). That would slip the PR by ~3 days.
7. **Whether the orchestrator skill should auto-thread `parent_receipt_sha256` or require explicit operator action.** Default: auto-thread (the chain is invisible to the operator). The argument for explicit: the operator should be aware of the chain because it has audit implications. The argument against (current default): the chain is mechanical; the operator should not be in the loop for plumbing.
8. **`gateway.yaml.template` vs `gateway.yaml.example`.** Template implies the operator runs an env-var substitution step. Example implies they edit it directly. Default: template, because we ship the file with `${OPSBENCH_GATEWAY_URL}` placeholders that don't validate as YAML literals. Reviewer may prefer the `.example` shape with literal default values.
9. **Should bootstrap-verifier produce a Backstage catalog entry as part of its output?** Default: no — it emits `bootstrap-report.json`, and a follow-up skill `backstage-catalog-sync` consumes it. Folding the catalog-write into the verifier would mean the verifier is no longer read-only, which violates § 6's Cedar posture. So this is a hard no, but flagging because reviewers in past have asked for it.
10. **Whether this PR should also include `team-platform-engineering` Pi marketplace artwork / metadata, or whether that's a follow-up.** Default: follow-up. The PR is already large; metadata + screenshots for the marketplace can land in a separate PR alongside the actual Pi registration submission.
