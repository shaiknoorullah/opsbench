# Megaroll Rollout — opsbench F-series end-to-end

**Status:** draft 2026-06-04 — awaiting reviewer approval
**Inputs:**

- [`./2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md) — the F-series master roadmap (post-pivot from P-series)
- [`../research/2026-06-04-ecosystem-catalog.md`](../research/2026-06-04-ecosystem-catalog.md) — 25-domain ecosystem catalog (367 candidates) that drove the pivot
- The 8 phase artifacts shipped by this megaroll (F0 plan + F1/F2/F3 spec & plan + 5 F4 specs + F5 spec & plan + 4 F6 evaluations)

This document is the **audit trail** of the megaroll workflow run. The reviewer uses it to understand what shipped, what's queued, and what merge order to follow.

---

## Summary table

| Phase | Name | What shipped | Status | Branch | PR | Lines |
|-------|------|--------------|--------|--------|----|------:|
| F0 | Recipe bulk-ship | 33 catalog-derived MCP recipes + 5 inherited (TheHive/OpenCTI/azure-skills/k8sgpt/CLI-Anything) + Falco-event-ingest skill + integrations.md + README updates | **impl** | `feat/f0-recipe-bulk-ship` | **#19** (open) | ~38 recipes |
| F1 | Cedar-for-agents adoption | Spec + plan for a build-time generator that derives `tools-generated.cedar` from each recipe's `tools:` frontmatter | spec + plan | `docs/f1-f6-scaffolds` | TBD (this branch) | 465 + 1261 |
| F2 | `opsbench-gateway` | Spec + plan for a Go-based Cedar-evaluated MCP proxy forked from `stacklok/toolhive` with custody.log emission, redaction, recipe rewrites | spec + plan | `docs/f1-f6-scaffolds` | TBD | 468 + 870 |
| F3 | Signed receipts (evidence v2) | Spec + plan for Ed25519 receipt envelope, schema, key bootstrap in installer, Bash + Go verifiers, mirror, hook fallback | spec + plan | `docs/f1-f6-scaffolds` | TBD | 547 + 2328 |
| F4 | Team packages | 5 design specs for team-platform-engineering / team-security-response / team-network-operations / team-data-platform / team-it-helpdesk | spec-only ×5 | `docs/f1-f6-scaffolds` | TBD | ~400–800 each |
| F5 | Pi-first multi-host parity + installer matrix | Spec + plan for `tools/pi-compat-layer/`, Codex strengthening, 4 other-host adapters, Homebrew/AUR/Nix installer matrix | spec + plan | `docs/f1-f6-scaffolds` | TBD | 228 + ~700 |
| F6 | Architectural evaluations | 4 evaluation docs: agentgateway, sympozium, prempti, scopeblind-gateway | evaluations ×4 | `docs/f1-f6-scaffolds` | TBD | ~250–310 each |

---

## Per-phase summary

### F0 — Recipe bulk-ship

PR #19 ships 38 MCP recipe files plus the Falco skill plus the rewritten `docs/integrations.md`. Recipe selection draws from the catalog's "high-fit by integration_vector: mcp-recipe" table. The Pi-first cross-cutting principle is honored: each recipe leads with the Pi-via-CLI-Anything wrap path (since Pi intentionally avoids built-in MCP) and the Claude Code MCP config is the secondary block. Other hosts (Codex / Copilot / Cursor / Gemini / OpenCode) get a one-line pointer to F5's `tools/<host>-compat-layer/`. **Open question for reviewer:** whether to trim from 38 to ~30 by dropping the 4 weakest community-maintained entries (kyverno-mcp AGPL, alertmanager-mcp 20★ community, signoz-mcp single-vendor, talos-mcp 0★ community).

### F1 — Cedar-for-agents adoption

The F1 design replaces opsbench's hand-written per-agent Cedar allowlists with a build-time generator: every recipe ships a structured `tools:` frontmatter block; `scripts/generate-cedar-policy.sh` consumes it and emits `policies/tools-generated.cedar`. The existing hand-authored `policies/tools.cedar` (617 lines) stays as the authoritative override layer. The F1 plan ships in **two PRs** — PR A (`feat/f1-cedar-generator`) for the script + CI + schema, PR B (`feat/f1-recipe-tools-frontmatter`) for the 16-recipe backfill. Pi adapter included: `tools/pi-compat-layer/cedar-emit.sh` re-projects the generated Cedar into Pi-shaped allowlists at `${PI_PREFIX}/allowlists/opsbench.json`. **Open question for reviewer:** whether to keep the existing 617-line `tools.cedar` intact in F1 (deferred cleanup to F4 per the spec) or run a careful overlap audit in F1 itself.

### F2 — `opsbench-gateway`

F2's design vendors `stacklok/toolhive` under `packages/opsbench-gateway/` (Apache-2.0 compatible with MIT) and layers a Cedar evaluator (cedar-go), a JSONL custody log writer with two-layer redaction (structural + strict deny-list), and a CLI surface (`serve`, `policy lint`, `policy explain`, `custody verify-format`, `pi-snippet`). Schema-version literal `v1` is enforced so F3's `v2` reader can branch additively. Distribution: Docker image (`ghcr.io/shaiknoorullah/opsbench-gateway`) + statically-linked multi-arch binary. The plan ships in **5 PRs**: vendor + shell, Cedar evaluator + differential tests, custody log + redaction + rotation, CLI + CI + Docker + GHCR release, recipe rewrites pointing every F0/F1 recipe at the gateway URL. **Open questions for reviewer:** (1) vendor vs sibling repo; (2) cedar-go vs Rust CLI subprocess; (3) SIGHUP-vs-file-watcher reload.

### F3 — Signed receipts (evidence v2)

F3 introduces an Ed25519 receipt envelope (`receipt.v1.json`) plus an additive `custody-log.v2.json` schema that preserves backwards compatibility with F2's v1 records. The receipt content: `ts`, `gateway_id`, `agent_class`, `tool`, `args_sha256`, `response_sha256`, `decision`, `signer_pubkey`, `signature`, plus canonical-form helpers (`signed_at`, `signed_payload_canonical_sha256`, `signer_pubkey_fingerprint`, `signer_id`, `parent_receipt_sha256` for chain-of-receipts). Key bootstrap lives in `scripts/install.sh` via `ensure_signing_keys` with `--bootstrap-keys-only` and `--no-keys` flags; private key at `~/.config/opsbench/keys/gateway.key` (mode 600). Verifier ships as both pure `bash + openssl + jq` (`scripts/verify-receipts.sh` with `--strict` and `--pubkey-map`) and a Go package (`internal/signing/`) for in-gateway use. Optional S3-compatible mirror with object-lock enforcement. The plan ships in **4 PRs**, each independently revertable. **Open questions for reviewer:** (1) HSM support (deferred to F6); (2) mirror backend default (S3-only in F3, Azure Blob + GCS later); (3) `scopeblind-gateway` upstream contribution timing (F6 owns that decision).

### F4 — Team packages

Five spec-only deliverables for the five team packages:

#### F4.1 — `team-platform-engineering`

Templated on `Azure/git-ape`. Initial scope: IaC orchestration (Terraform / Pulumi / Crossplane), GitOps runners (Argo CD / Flux), drift detection, environment promotion. Catalog surfaced ~40 strong candidates across the underlying domains.

#### F4.2 — `team-security-response`

Promoted from v5.x because the catalog showed mature SOC tooling. Initial agents: Wazuh, MISP, TheHive, OpenCTI, Velociraptor, CrowdStrike Falcon MCP, Trivy, Kubescape. Reuses the existing forensic-incident-response patterns from `team-incident-response` plus SOC-specific case management.

#### F4.3 — `team-network-operations`

Promoted from v5.x because the eBPF / Cilium ecosystem is mature enough now. eBPF analyzers (Cilium, Inspektor Gadget, Pixie), Kubeshark traffic capture, mesh ops (Istio / Linkerd), DNS forensics.

#### F4.4 — `team-data-platform`

Backup verifiers (Velero / Kasten / Stash), schema migrations (Liquibase / Flyway / Atlas / Alembic), CDC pipelines (Debezium / Kafka Connect).

#### F4.5 — `team-it-helpdesk`

Identity (Entra ID / Okta / Keycloak), endpoint management (Intune / Jamf), M365 / Google Workspace tenant ops.

### F5 — Pi-first multi-host parity + installer matrix

The headline distribution phase. Spec + plan describe a new `tools/pi-compat-layer/` mirroring the existing `tools/codex-compat-layer/`. Generator script `tools/pi-compat-layer/adapt.sh` reads opsbench `SKILL.md` files and emits Pi-native manifests under `${PI_PREFIX:-${HOME}/.pi}/skills/<team>/<skill>/`. Author the canonical Pi distribution of all 11 skills + 33 agents already in `team-incident-response`. Pi marketplace submission lives at `tools/pi-compat-layer/marketplace/manifest.yaml` — non-blocking on approval since install-from-source covers the gap (`pi install git:github.com/shaiknoorullah/opsbench`). After Pi: strengthen `tools/codex-compat-layer/adapt.sh` (replace `TODO_AGENT_CALL` / `TODO_TASK_CREATE` / `TODO_SKILL_INVOKE` with real Codex equivalents, with a `hard-cases.txt` carve-out for `parallel-hypothesis-debug` and `forensic-synthesis`). Then 4 other-host adapters (Copilot / Cursor / Gemini / OpenCode). Installer matrix LAST: Homebrew formula + tap (`shaiknoorullah/homebrew-opsbench`), AUR PKGBUILD (`opsbench` + meta-package `opsbench-all`), `flake.nix` at repo root (`packages.default = opsbench-pi`). CI matrix on tag push (`brew-bottle`, `aur-publish`, `nix-build`). **Open questions for reviewer:** (1) marketplace gating on release tag; (2) Codex hard-case carve-out scope; (3) Windows packaging (winget) in F5 or later.

### F6 — Architectural evaluations

Four spec-only evaluations of adjacent projects that could compete with, compose with, or replace opsbench's F2 gateway / F3 receipts / Cedar story:

- **agentgateway** — Recommended: **compose if agentgateway hits GA before opsbench-gateway has 3+ production users**, otherwise stay independent. Rust/Envoy AI-native dataplane natively speaking MCP/A2A, 3000 stars, pre-GA.
- **sympozium** — Recommended: **layer on top**. K8s-native multi-agent coordination layer; opsbench's value (policy + evidence) is reusable regardless of deployment mode, so sympozium becomes a recommended K8s deployment path with opsbench skills mounted as a Helm sub-chart.
- **prempti** — Recommended: **opt-in default on Linux** via `installer --with-prempti` flag. Falco-adjacent syscall-level enforcement; the natural defense-in-depth layer beneath Cedar. Trade-off: serious deployments get kernel enforcement; laptops aren't forced to install Falco.
- **scopeblind-gateway** — Recommended: **contribute receipt-format spec upstream**. F3 already adopts scopeblind's receipt format; the upstream contribution achieves cross-implementation interop without merging the gateways. Possible vendor-neutral spec home: IETF or CNCF.

---

## Two PRs open from this megaroll

| PR | Branch | Scope | Status |
|----|--------|-------|--------|
| **#19** | `feat/f0-recipe-bulk-ship` | F0 impl: 38 recipes + Falco skill + integrations.md + README updates | Open, cspell fix pushed, awaiting reviewer |
| **TBD** | `docs/f1-f6-scaffolds` | F1–F6 specs + plans (F2 + F3 plans; 5 F4 specs; F5 spec + plan; 4 F6 evaluations) | This branch — opening PR after merge of this rollout doc |

The F0 PR (#19) is **independent** of the scaffolds PR. The scaffolds PR landing first or second does not change the F-series semantics; they both add docs and no code/behavior. Recommended merge order: **#19 first** (it's the impl that downstream phases need merged for their preflight gates), then the scaffolds PR.

---

## Recommended merge order

1. **PR #19 (F0 impl).** Establishes the recipe surface that F1's generator iterates over. Required for F1's preflight gate PF.1.
2. **Scaffolds PR (this branch).** Ships F1–F6 specs + plans. Lands the audit trail before any implementation work begins.
3. **F1 impl workflow.** Small surface (bash generator + 16-recipe frontmatter backfill). Launch as a per-phase workflow with two parallel sub-tracks: PR A (`feat/f1-cedar-generator`) and PR B (`feat/f1-recipe-tools-frontmatter`).
4. **F2 impl workflow.** Substantial Go engineering. Recommend splitting into 5 sub-workflows (one per PR shape in the F2 plan): vendor + shell, Cedar evaluator, custody log, CLI + CI + Docker, recipe rewrites. Reviewer should pay attention to the vendor commit (one large diff importing toolhive) and the Cedar evaluator differential test (Rust ↔ Go parity proof).
5. **F3 impl workflow.** Medium surface. Schemas + Bash verifier + Go signing package + hook fallback + optional S3 mirror. **Reviewer must verify the keypair generation path in `scripts/install.sh` before merging PR1.**
6. **F4 per-team workflows (5 of them).** Each team gets its own brainstorming → plan → impl cycle. Can parallelize within F4 once F3 lands (teams are independent of each other).
7. **F5 impl workflow.** Pi adapter primary, then other hosts, then installer matrix. 5 PRs per the F5 plan. **Reviewer must inspect the Homebrew tap repo before tagging the first release** (tap repo is generated, not hand-authored).
8. **F6 actioning.** Each evaluation triggers its own plan if the recommendation is acted on. The scopeblind-gateway upstream contribution can land early (low risk, high signal); the agentgateway compose-vs-compete decision is gated on agentgateway hitting GA + opsbench-gateway production usage signal.

---

## Follow-up workflows the reviewer should launch after merging

- **F1 impl** (~1–2 weeks of work): `feat/f1-cedar-generator` + `feat/f1-recipe-tools-frontmatter`.
- **F2 impl** (~3–4 weeks): 5 PRs from F2 plan.
- **F3 impl** (~1–2 weeks): 4 PRs from F3 plan.
- **F4 × 5** (~3–6 weeks each, parallelizable): one workflow per team package.
- **F5 impl** (~2–3 weeks): 5 PRs from F5 plan.
- **F6 actioning** (~1–2 weeks per evaluation, can interleave): scopeblind-gateway contribution first; agentgateway watch; prempti opt-in flag; sympozium Helm sub-chart.

**Cumulative estimated wall-clock:** 12–17 weeks of focused work assuming sequential phases with parallelism within F4 and F5.

---

## Outstanding risks / questions

Collected from the F0–F6 specs. Reviewer should triage which need a decision before launching the next per-phase workflow.

1. **F0 — recipe trim.** 38 recipes vs trim to ~30. Drop weakest community-maintained entries?
2. **F1 — existing tools.cedar overlap audit.** Keep the 617-line hand-authored file intact in F1 (default) or audit overlaps now?
3. **F2 — vendor vs sibling.** Vendor toolhive under `packages/opsbench-gateway/` (default) or maintain as a sibling fork repo?
4. **F2 — Cedar evaluator language.** cedar-go in-process (default) or Rust CLI subprocess for parity with upstream Cedar?
5. **F2 — policy reload mechanism.** SIGHUP (default) or file-watcher?
6. **F3 — HSM support.** Deferred to F6 (default) — confirm.
7. **F3 — mirror backend default.** S3-only in F3 (default) with Azure Blob + GCS as F4 follow-up.
8. **F3 — `scopeblind-gateway` upstream contribution.** F6 owns the decision; F3 ships the format as the opsbench contract.
9. **F4 — team-platform-engineering scope.** Initial roster of skills/agents — reviewer should confirm before launching the F4.1 workflow.
10. **F4 — team-security-response.** Overlap with existing `team-incident-response`. Where does forensic IR end and SOC begin?
11. **F4 — team-network-operations.** Skill inventory pulls from a rich catalog domain — risk of bloat. Cap at 12 skills?
12. **F4 — team-data-platform.** CDC scope (Debezium / Kafka Connect) requires a running Kafka — devbox testability is a real concern.
13. **F4 — team-it-helpdesk.** Identity providers have wildly different APIs (Entra ID vs Okta vs Keycloak) — should this ship one identity adapter or three?
14. **F5 — marketplace gating.** Release tag allowed before Pi marketplace approval (default) or hold?
15. **F5 — Codex hard-cases.** Whitelist `parallel-hypothesis-debug` + `forensic-synthesis` from no-TODO check (default) or ship a real workaround (`tmux` multiplexing)?
16. **F5 — Windows packaging.** Hold for later F-phase (default) or ship winget in F5?
17. **F6 — agentgateway timing.** What's the GA timeline? When does opsbench-gateway have "3+ production users" measurable?
18. **F6 — sympozium.** Helm sub-chart shape — opsbench-managed (default) or sympozium upstream?
19. **F6 — prempti.** Compose with sympozium's gVisor/Kata sandbox? Perf overhead measurable on opsbench's test bench?
20. **F6 — scopeblind-gateway.** Receipt-format vendor-neutral spec home — IETF, CNCF, OpenInfra Foundation, or staying repo-owned?

### Cross-cutting risks

- **Licensing.** AGPL recipes (`kyverno-mcp`, `flux-mcp`) ship as external-process pointers, never vendored. Toolhive (Apache-2.0) is vendored — confirm opsbench's MIT license stays primary (Apache compat: yes).
- **Pi marketplace approval pacing.** Pi (pi.dev) is a young project; marketplace approval cadence is unknown. F5 mitigates by shipping install-from-source as the primary path.
- **cedar-for-agents upstream maturity.** F1 pins to a specific version; breaking changes risk a regeneration burden. Mitigation: pin + vendor the CLI binary in CI.
- **toolhive upstream drift.** F2 establishes a monthly upstream-sync cadence. If toolhive shifts substantially, the fork becomes its own maintenance line.

---

## Workflow run metadata

- **Initial workflow:** `wf_2de896c8-408` (ecosystem research, 25 domains, 367 candidates, 1.9M tokens) — produced the catalog.
- **Megaroll workflow:** `wf_1a2fd4e4-486` (initial run + resume). Cached F0 results carried through resume. Failed at `parallel[0]` (team-platform-engineering F4 spec) and `parallel[4]` (team-it-helpdesk F4 spec) — both agents completed the Write call to disk but failed to emit StructuredOutput after 2 nudges, so the workflow aborted before F5 + F6 + finalize. **Recovery:** committed F4 specs that wrote to disk; dispatched 5 parallel general-purpose agents inline to write F5 spec + 4 F6 evaluations; wrote F5 plan + this rollout doc inline. 2 of the inline agents (F5 plan and rollout doc) hit socket errors after ~107 minutes — files were re-written inline.
- **Total subagent count this megaroll:** ~50+ (counting recovery).
- **Total subagent tokens this megaroll:** ~700K (initial workflow) + ~400K (recovery) ≈ 1.1M tokens.
- **Wall-clock:** initial workflow ~36 minutes (to failure point), recovery + inline rewrites ~2 hours.

---

## What this rollout doc does NOT do

- It does not enumerate every file in every F-phase plan. The plan documents are the authoritative source.
- It does not commit the reviewer to any specific F6 actioning. The F6 evaluations recommend, they do not bind.
- It does not modify F0's PR #19 — that PR is already open and reviewed on its own merits.
- It does not change the Pi-first cross-cutting principle established in the master roadmap. Every downstream phase honors it.

---

## Next reviewer action

1. Open `docs/superpowers/specs/2026-06-04-f-series-master-roadmap.md` and confirm the F0–F6 ordering still matches your intent.
2. Open this branch's PR (once created) and approve / request changes.
3. If approved: merge PR #19 first, then this scaffolds PR. Launch the F1 impl workflow next.
