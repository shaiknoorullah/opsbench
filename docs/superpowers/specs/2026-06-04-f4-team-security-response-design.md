# F4 — `team-security-response` Package Design

**Status:** draft 2026-06-04 — spec-only (awaiting reviewer approval before plan / implementation)
**Parent:** [`2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md) — F4 section, item 2 of 5
**Sibling F4 specs:** `team-platform-engineering` (#1), `team-network-operations` (#3), `team-data-platform` (#4), `team-it-helpdesk` (#5)
**Foundation prerequisites:** F0 (recipe bulk-ship), F1 (`tools-generated.cedar`), F2 (`opsbench-gateway`), F3 (signed receipts)
**Catalog inputs:** `docs/superpowers/research/2026-06-04-ecosystem-catalog.md` — `security-soc-platforms`, `security-threat-intel`, `security-edr-endpoint`, `security-supply-chain`, `security-k8s-posture` domains

---

## 1. Purpose

`team-security-response` is the F4 package that wraps the SOC / DFIR / threat-intel
tooling ecosystem behind opsbench's gateway-mediated, Cedar-enforced, receipt-sealed
foundation. It is the **promotion of v5.x's security-tooling work** from "speculative future scope"
to "shippable team package", driven by the catalog finding that the SOC tooling ecosystem
is now MCP-mature: Wazuh, MISP, TheHive, OpenCTI, Velociraptor, CrowdStrike Falcon,
Trivy, and Kubescape all have vendor or vendor-blessed MCP surfaces (or
CLI-Anything-wrappable CLIs) ready for adoption.

The package answers a single operational question: **"A signal arrives. What does the
agent do, with what tools, under what policy, and how do we prove it later?"**

Concretely, it provides:

1. **Skills** — composable runbooks for triage, IOC enrichment, host containment,
   evidence acquisition, malware sandboxing, posture remediation, and supply-chain
   incident response.
2. **Agents** — a layered roster (commander → analysts → containment → enrichment →
   evidence → reporting) with Cedar-derived tool allowlists per role.
3. **Schemas** — the JSON shapes for alerts, indicators, containment actions, evidence
   chain-of-custody envelopes, and final security incident reports.
4. **MCP recipe cross-links** — pointers into the F0 recipe corpus (Wazuh / MISP /
   TheHive / OpenCTI / Velociraptor / Falcon / Trivy / Kubescape) without duplicating
   the recipes.
5. **Cedar overrides** — a small, hand-written policy layer for the rare cases where
   `tools-generated.cedar` doesn't capture a security-specific nuance (e.g., RTR-only
   gating on Falcon, write-VQL denial on Velociraptor).
6. **Hooks** — minimal `PreToolUse` / `PostToolUse` shims that augment the foundation
   custody.log with security-domain redaction (PII, secrets-in-IOCs, reversible
   threat actor names).

This package is intentionally **thin**. The foundation already handles routing
(`opsbench-gateway`), authorization (Cedar + Cedar-for-agents), custody
(`scripts/custody-append.sh`), and receipts (Ed25519 signed). The team package
specializes the foundation; it does not duplicate it.

### What this package is NOT

- It is **not** a SOAR platform. It does not orchestrate playbook fan-out across many
  signals — the orchestrator agent issues one playbook at a time, on demand.
- It is **not** a replacement for TheHive / MISP / Wazuh / Falcon. It is an *agent layer*
  in front of those products, with explicit read-by-default posture and gated writes.
- It is **not** an autonomous responder. Every containment action is **gated** behind
  Cedar allow-list + (where the foundation supports it) human-in-the-loop affirmations.
- It is **not** a vulnerability-management workflow owner. Trivy / Kubescape MCPs
  surface findings; routing those findings into ticketing / patch cadence is
  `team-platform-engineering`'s job.

---

## 2. Skill inventory

Target: **8–15 skills**. The list below has **12 skills** — six "core triage" skills
that map 1:1 to MITRE-style phases (detect → triage → contain → eradicate → recover →
lessons), plus six specialty skills that target high-value SOC patterns (IOC enrichment,
host triage, malware sandboxing, posture remediation, supply-chain incident response,
threat-actor attribution).

Naming convention follows the existing `team-incident-response` pattern: lowercase,
hyphenated, verb-noun where possible.

| # | Skill ID | One-line description |
| - | -------- | -------------------- |
| 1 | `security-alert-triage` | Read alerts from Wazuh / Falcon / EDR feeds; rank by Cedar-allowed severity model; emit triage verdict per alert. |
| 2 | `ioc-enrichment` | Take a raw indicator (IP / hash / URL / domain); pivot through MISP and OpenCTI; return an enriched IOC bundle with attribution confidence. |
| 3 | `case-management-thehive` | Create / update / close TheHive cases; link IOCs as observables; attach evidence; transition case state per Cedar policy. |
| 4 | `host-triage-velociraptor` | Drive Velociraptor read-only VQL collections for host artifacts (process tree, network sockets, autoruns, browser history) into the custody.log. |
| 5 | `endpoint-containment-falcon` | Issue CrowdStrike Falcon RTR commands — network containment (`contain`/`lift_containment`), process kill, file quarantine — *gated by per-host Cedar allow*. |
| 6 | `malware-sandbox-submit` | Submit a hash or file to a sandbox (Joe Sandbox / Hatching Triage / Cuckoo via CLI-Anything wrap); poll for verdict; attach report to TheHive case. |
| 7 | `cve-impact-trivy` | Cross-reference a CVE against the current image / SBOM inventory via Trivy MCP; emit a structured impact-report (affected workloads, suggested patch level). |
| 8 | `kubernetes-posture-kubescape` | Run Kubescape framework scans (NSA-CISA, MITRE ATT&CK, NIST); produce a structured remediation plan; do **not** auto-apply. |
| 9 | `supply-chain-incident` | When an SBOM-level compromise lands (e.g., npm typosquat, malicious GH Action), correlate Trivy + GitHub MCP findings into a single incident envelope; propose containment actions. |
| 10 | `threat-actor-attribution` | Pivot from observables into OpenCTI's actor / campaign graph; emit a confidence-scored attribution note (defaults to "low confidence" unless ≥3 corroborating IOCs). |
| 11 | `security-incident-report` | Produce the after-action report — auto-fills from custody.log entries, TheHive case timeline, and the IOC bundle; renders Markdown + JSON. |
| 12 | `security-playbook-runner` | Top-level skill the commander agent uses to chain N of the above skills into a single named playbook (e.g., `ransomware-suspected`, `credential-theft-observed`, `supply-chain-compromise`). |

### Skill design constraints

- **Every skill SHALL be Pi-first.** The skill body documents Pi invocation first; an
  "Also runs on Claude Code / Codex / Cursor / Gemini / OpenCode / Copilot" section
  follows.
- **Every skill SHALL declare a Cedar role.** The YAML frontmatter includes
  `cedar_role: <agent_class>` so the F1 generator can scope the skill's tool
  allowlist.
- **Every skill SHALL be read-only by default.** Any write action (containment, case
  update, sandbox submission) is gated behind an explicit `requires_writes: true`
  flag and a Cedar `Allow` action that names the precise tool.
- **Every skill SHALL emit custody.log entries.** The foundation's
  `scripts/custody-append.sh` is called as a sub-shell; skills do not bypass.
- **Every skill SHALL accept and emit at least one of the schemas in §4** — no
  ad-hoc shapes.

### Cross-links to `team-incident-response`

`team-security-response` is the security-specific cousin of `team-incident-response`.
We deliberately **do not duplicate** the latter's skills. Instead, the security
package cross-references:

- `incident-quarantine` (team-incident-response) for cluster-level isolation. The
  security package's `endpoint-containment-falcon` covers *endpoint* containment;
  cluster-level remains the IR team's responsibility.
- `incident-timeline` (team-incident-response) for the timeline scaffold. The
  security report skill (`security-incident-report`) imports the timeline schema and
  fills it.
- `evidence-collection-orchestrator` and `evidence-cataloger` (team-incident-response)
  for the generic chain-of-custody plumbing. `host-triage-velociraptor` consumes
  those skills' contracts.

The two team packages co-exist; users install both when their team owns both ops and
SOC duties. A small portion of users will install only `team-security-response`
(SOC-only orgs), so the package SHALL be functionally self-contained — its skills
must run without `team-incident-response` present (degrading gracefully to "skill
unavailable, falling back to local custody.log only" rather than hard-erroring).

---

## 3. Agent inventory

Target: **5–15 agents**. The list below has **11 agents** organized into **four
team-N subgroups** (mirroring the team-incident-response convention). Each agent's
tool allowlist is documented as a **Cedar action set** — the actual Cedar policy
text is generated from `tools:` frontmatter blocks in the recipes (F1), with this
package's `policies/cedar/overrides.cedar` adding security-specific deny rules.

### Team 1 — Command

The orchestrator tier. One agent. Holds the lowest direct-tool allowlist of any
agent in the package; its primary job is to **delegate** to specialists.

| Agent ID | Capability | Default tool allowlist |
| -------- | ---------- | ---------------------- |
| `security-incident-commander` | Owns the playbook lifecycle. Receives a triage verdict; selects a playbook; dispatches specialist agents; finalizes the report. | TheHive `case.create`, `case.update`; custody.log append; agent dispatch only. **No direct MCP write access** to Wazuh / Falcon / Velociraptor / MISP / OpenCTI / Trivy / Kubescape. |

### Team 2 — Triage & Enrichment

The detection-side tier. Three agents. Read-only across the entire IOC graph;
emits verdicts that the commander uses to pick a playbook.

| Agent ID | Capability | Default tool allowlist |
| -------- | ---------- | ---------------------- |
| `alert-triage-analyst` | Reads Wazuh / Falcon alerts; ranks; emits `triage-verdict` envelope. | Wazuh `rules.list`, `alerts.search`, `agents.list`; Falcon `detects.search`, `incidents.search`; custody.log append. **Read-only.** |
| `ioc-enrichment-analyst` | Pivots through MISP + OpenCTI for any observable; returns enriched `ioc-bundle`. | MISP `events.search`, `attributes.search`, `tags.list`; OpenCTI `stix-domain-objects.search`, `stix-cyber-observables.search`, `indicators.search`; custody.log append. **Read-only.** |
| `threat-attribution-analyst` | Specializes in actor / campaign attribution; consumes IOC bundles, returns confidence-scored attribution. | OpenCTI `threat-actors.search`, `campaigns.search`, `intrusion-sets.search`, `reports.search`; custody.log append. **Read-only.** Cedar enforces "no MISP write" even though MISP isn't called. |

### Team 3 — Containment & Forensics

The response-side tier. Four agents. **All Cedar-gated.** Containment writes are
the only place in the package where mutation tools fire.

| Agent ID | Capability | Default tool allowlist |
| -------- | ---------- | ---------------------- |
| `endpoint-containment-operator` | Issues Falcon RTR `contain` / `lift_containment` per host; records action in custody.log. | Falcon `hosts.contain`, `hosts.lift_containment`, `hosts.get_device_details`; custody.log append. Cedar override: `contain` allowed only with explicit `host_id` matching a triage verdict's `affected_hosts[]`. |
| `process-killer-operator` | Falcon RTR `runscript` with `kill -9 <PID>` style commands; also feeds OS-level kill via Velociraptor. | Falcon `rtr.execute_command` (filtered to `kill` family); Velociraptor `RunVQL` (with `allow_write=false`); custody.log append. **No file-write commands.** |
| `host-forensics-collector` | Runs Velociraptor read-only VQL collections; uploads artifacts to custody store. | Velociraptor `RunVQL` with `allow_write=false`, `ArtifactRepository.list`; custody.log append. **Read-only.** |
| `sandbox-submitter` | Submits hashes / files to the configured malware sandbox; polls for verdict. | Sandbox MCP (`submit`, `report.get`, `report.poll`); custody.log append. Cedar override: `submit` requires a `triage_verdict_id` to be present. |

### Team 4 — Posture & Supply-Chain

The proactive / vulnerability tier. Two agents. Read-only; produces remediation
**plans** but never auto-applies.

| Agent ID | Capability | Default tool allowlist |
| -------- | ---------- | ---------------------- |
| `cve-impact-analyst` | Trivy MCP scans against the cluster's current image inventory; correlates to running workloads. | Trivy `scan.image`, `scan.sbom`, `scan.filesystem`; GitHub MCP `repos.get_contents` (for reading SBOMs from repos); custody.log append. **Read-only.** |
| `kubernetes-posture-analyst` | Kubescape framework scans; emits remediation plan; cross-links to Trivy findings. | Kubescape MCP `framework_scan`, `vuln_scan`, `repo_scan`; custody.log append. **Read-only.** Cedar denies any `apply` / `fix` tool by default. |

### Team 5 — Reporting

One agent.

| Agent ID | Capability | Default tool allowlist |
| -------- | ---------- | ---------------------- |
| `security-report-writer` | Produces the after-action security report from custody.log + TheHive case. | TheHive `case.get`, `case.list_observables`, `case.list_tasks`; OpenCTI `reports.create` (gated by Cedar — only when the commander explicitly authorizes the final-report write); custody.log append. |

### Total: 11 agents

Counting the orchestrator and across the 5 subgroups: 1 + 3 + 4 + 2 + 1 = **11
agents**, comfortably inside the 5–15 target.

### Why this split

- The commander has minimal direct tool access — it cannot accidentally contain a
  host. All write actions route through specialists with narrowly scoped Cedar
  allowlists. This mirrors the IR commander pattern in `team-incident-response`
  and is the F2 gateway's strongest enforcement story.
- Read-only agents are deliberately numerous (analysts + collectors = 6 of 11).
  This reflects the SOC reality: most response time is spent reading IOCs and
  artifacts, not issuing writes.
- The two `*-operator` agents are the *only* write-capable agents, and both
  carry Cedar policy that requires structured pre-conditions (a triage verdict
  ID, a matching affected host). This keeps the blast radius small even if an
  agent goes off-script.

---

## 4. Schemas

Target: **3–6 JSON schemas, draft-2020-12**. The list below has **5 schemas**.

All schemas live under `packages/team-security-response/schemas/` and are
referenced by skills + agents via `$id` URIs of the form
`https://opsbench.dev/schemas/team-security-response/<name>.v1.json`.

| # | Schema | Shapes | Used by |
| - | ------ | ------ | ------- |
| 1 | `triage-verdict.schema.json` | One alert's triage result: `alert_id`, `source` (wazuh / falcon / custom), `severity` (1–5), `verdict` (false_positive / known_benign / suspicious / confirmed_incident), `affected_hosts[]`, `recommended_playbook`, `confidence`, `evidence_refs[]`. | `security-alert-triage`, `alert-triage-analyst`, `security-incident-commander`. |
| 2 | `ioc-bundle.schema.json` | A pivot-enriched IOC envelope: `observable` (`type` ∈ ip / hash / url / domain / email / asn, `value`), `enrichment` (`misp_events[]`, `opencti_indicators[]`, `attribution[]`), `tlp`, `first_seen`, `last_seen`, `confidence`. | `ioc-enrichment`, `threat-actor-attribution`, all Team-2 agents. |
| 3 | `containment-action.schema.json` | A single containment operation: `host_id`, `action` (network_contain / process_kill / file_quarantine / lift_containment), `requested_by` (agent ID), `triage_verdict_id` (FK), `executed_at`, `result` (success / failed / pending), `falcon_session_id`, `custody_entry_id`. | `endpoint-containment-falcon`, `endpoint-containment-operator`, `process-killer-operator`. |
| 4 | `evidence-envelope.schema.json` | A chain-of-custody envelope around one artifact: `artifact_id`, `collector` (velociraptor / falcon-rtr / sandbox), `collection_method`, `collected_at`, `host_id`, `sha256`, `signer_pubkey`, `signature` (Ed25519, from F3), `chain[]` (sequence of custody.log entry IDs). | `host-triage-velociraptor`, `host-forensics-collector`, `evidence-cataloger` (cross-package), `security-report-writer`. |
| 5 | `security-incident-report.schema.json` | The after-action report shape: `incident_id`, `playbook_used`, `commander_agent`, `started_at`, `closed_at`, `verdicts[]`, `containment_actions[]`, `evidence_envelopes[]`, `attribution[]`, `lessons[]`, `thehive_case_id`, `opencti_report_id`. | `security-incident-report`, `security-report-writer`. |

### Schema design constraints

- All five schemas SHALL be **draft-2020-12** compliant.
- All five schemas SHALL include `$id`, `$schema`, `title`, `description`, and a
  top-level `examples[]` array with at least one valid example.
- All five schemas SHALL be referenced by `$ref` from the relevant skill SKILL.md
  frontmatter under `inputs:` / `outputs:` blocks so the contract is machine-checkable.
- The `evidence-envelope` schema SHALL be compatible with `team-incident-response`'s
  `custody-entry.schema.json` — specifically, the `chain[]` field's elements
  SHALL be valid `custody-entry` IDs. The two packages cross-validate.
- The `containment-action.schema.json` SHALL declare `triage_verdict_id` as a
  required field so Cedar can enforce "no containment without triage".

### Schemas we deliberately do NOT add

- **No alert ingestion schema.** Wazuh's and Falcon's native event shapes are
  documented upstream; we consume them via their MCPs, not re-shape them.
- **No MISP / OpenCTI passthrough schemas.** Those projects publish STIX 2.1
  schemas; we cross-link rather than redefine.
- **No malware report schema.** Sandbox vendors disagree on shape; we treat the
  sandbox report as an opaque artifact in the `evidence-envelope`.

---

## 5. MCP recipes (curated subset)

This package does **not duplicate recipes**. Every recipe below already lives in
the catalog (F0 ships them into `packages/team-incident-response/mcp-recipes/`
in the bulk-ship); `team-security-response/mcp-recipes/` contains **symlinks +
team-specific commentary**.

| Recipe | Source (F0 location) | Why this team needs it | Cedar role used by |
| ------ | -------------------- | ---------------------- | ------------------ |
| `wazuh-mcp.md` | F0 (new) | Primary SIEM alert + agent telemetry source | `alert-triage-analyst` |
| `misp-mcp.md` | F0 (new) | Threat-intel event + indicator search | `ioc-enrichment-analyst`, `threat-attribution-analyst` |
| `thehive-mcp.md` | F0 (inherited from old P1, with `EXPERIMENTAL` banner) | Case lifecycle management | `security-incident-commander`, `security-report-writer` |
| `opencti-mcp.md` | F0 (inherited from old P1) | STIX object graph + attribution | `ioc-enrichment-analyst`, `threat-attribution-analyst`, `security-report-writer` |
| `velociraptor-mcp.md` | Already in tree (`team-incident-response/mcp-recipes/`) — to be enhanced with `tools:` frontmatter in F1 | DFIR / host forensics | `host-forensics-collector`, `process-killer-operator` |
| `crowdstrike-falcon-mcp.md` | F0 (new) | EDR detections + RTR containment | `alert-triage-analyst`, `endpoint-containment-operator`, `process-killer-operator` |
| `trivy-mcp.md` | F0 (new) | CVE scan against image / SBOM | `cve-impact-analyst`, `supply-chain-incident` workflows |
| `kubescape-mcp.md` | F0 (new) | K8s posture scans (NSA-CISA / MITRE / NIST frameworks) | `kubernetes-posture-analyst` |
| `github-mcp.md` | F0 (new) | SBOM fetch + supply-chain incident context | `cve-impact-analyst`, `supply-chain-incident` skill |
| `sandbox-cli-wrap.md` | F0-followup (deferred — not in F0 core ship; team adds a CLI-Anything wrap recipe pointing at Joe Sandbox / Hatching Triage public APIs) | Malware detonation | `sandbox-submitter` |

### Cross-link convention

`packages/team-security-response/mcp-recipes/` contains:

- A `README.md` listing every recipe + the agent class(es) that use it.
- Symlinks of the form `wazuh-mcp.md → ../../team-incident-response/mcp-recipes/wazuh-mcp.md`
  (or, if symlinks don't render well on GitHub, short stub files that `<!-- include -->`
  the canonical recipe — to be decided in the F4 implementation plan).
- A `SECURITY_NOTES.md` per recipe call-out where the security team's posture differs
  from the IR team's (e.g., Falcon's `read_only` mode is the IR default; security
  uses a `contain_only` mode that adds containment writes but no script-execution
  writes).

### Recipes we deliberately do NOT ship in this team package

- Wireshark / packet-capture MCPs — that lives in `team-network-operations`.
- Cilium / Inspektor Gadget — also `team-network-operations`.
- Identity-side (Entra / Okta / Keycloak) — those go in `team-it-helpdesk`. The
  security team gets *read-only* access to identity logs via a cross-team Cedar
  policy added in F4.5 if needed.

---

## 6. Cedar policy posture

The foundation generates the bulk of this package's Cedar policy from each recipe's
`tools:` frontmatter block (F1's `scripts/generate-cedar-policy.sh`). This package
ships a **small** policy directory with three files:

```
packages/team-security-response/policies/cedar/
├── overrides.cedar              # hand-written deny rules that beat the generator
├── role-bindings.cedar          # binds agent IDs (§3) to Cedar roles referenced in recipes
└── README.md                    # documents each override + role-binding
```

### `overrides.cedar` (hand-written denies)

These are the rules the generator can't infer from a recipe alone:

1. **Falcon `rtr.execute_command` filter.** The generator allows the whole
   `rtr` tool family for `process-killer-operator`. The override narrows it
   to commands matching a `kill -9 [0-9]+` regex; anything else (file write,
   network change, registry edit) is denied even if the agent tries to invoke
   it.

   ```cedar
   forbid (
     principal == TeamSecurityResponse::Agent::"process-killer-operator",
     action == MCP::Action::"falcon.rtr.execute_command",
     resource
   )
   when {
     !(resource.command_template matches "^kill -9 [0-9]+$")
   };
   ```

2. **Velociraptor write-VQL deny.** Velociraptor's `RunVQL` is a single tool that
   the generator allows for `host-forensics-collector`. The override denies any
   VQL string containing write-side verbs (`upload_file`, `remote_exec`,
   `artifact_collect_with_exec`).

   ```cedar
   forbid (
     principal == TeamSecurityResponse::Agent::"host-forensics-collector",
     action == MCP::Action::"velociraptor.RunVQL",
     resource
   )
   when {
     resource.vql_text matches "(?i)(upload_file|remote_exec|artifact_collect_with_exec|exec_run)"
   };
   ```

3. **Containment requires a triage verdict.** Cedar's `when` clause checks that
   the gateway-injected request context includes a `triage_verdict_id`
   referencing a verdict in `triage-verdict.schema.json` shape.

   ```cedar
   forbid (
     principal in TeamSecurityResponse::Role::"containment_operator",
     action in [MCP::Action::"falcon.hosts.contain",
                MCP::Action::"falcon.hosts.lift_containment"],
     resource
   )
   unless {
     context has "triage_verdict_id" &&
     context.triage_verdict_id matches "^tv_[a-z0-9]{16}$"
   };
   ```

4. **OpenCTI `reports.create` requires commander affirmation.** Only the
   commander agent — and only when the request carries a one-shot affirmation
   token — may invoke `opencti.reports.create`.

   ```cedar
   forbid (
     principal,
     action == MCP::Action::"opencti.reports.create",
     resource
   )
   unless {
     principal == TeamSecurityResponse::Agent::"security-report-writer" &&
     context has "commander_affirmation" &&
     context.commander_affirmation == "approved"
   };
   ```

5. **MISP write-side blanket deny for non-write agents.** Belt-and-suspenders
   against the generator drifting; we forbid every MISP write tool for every
   agent that isn't explicitly a write-side role (there is no such write role
   in this package's v1 — all MISP writes happen out-of-band today).

   ```cedar
   forbid (
     principal,
     action in [MCP::Action::"misp.events.create",
                MCP::Action::"misp.attributes.create",
                MCP::Action::"misp.events.update",
                MCP::Action::"misp.attributes.update",
                MCP::Action::"misp.events.delete",
                MCP::Action::"misp.attributes.delete"],
     resource
   );
   ```

### `role-bindings.cedar`

Binds the 11 agent IDs in §3 to the Cedar roles referenced in the F1-generated
file. Examples:

```cedar
@id("security-incident-commander-binding")
permit (
  principal == TeamSecurityResponse::Agent::"security-incident-commander",
  action,
  resource in MCP::Server::"thehive"
)
when { resource.action_kind in ["read", "case_lifecycle_write"] };
```

(Read: the commander may do read OR case-lifecycle-write on TheHive, nothing else.)

### Policy posture summary

- **Default deny** (foundation default; this package doesn't override).
- **Read-only for analysts and collectors** (6 of 11 agents).
- **Narrowly scoped writes for operators** (2 of 11 agents).
- **Case lifecycle for commander** (1 of 11 agents — no MCP mutation outside TheHive
  case lifecycle).
- **Report-side commander-affirmation requirement** (the only OpenCTI write).
- **Hand-written deny rules guard the gateway against generator drift** (5 overrides).

---

## 7. Pi-first authoring notes

Per the F-series cross-cutting principle and the Pi context callout, every skill and
agent in this package SHALL ship Pi-first — Pi's manifest is the canonical form;
other-host variants derive from it.

### Pi has no built-in MCP — the implications

Pi intentionally avoids built-in MCP. This package therefore uses **two distinct
integration patterns**, picked per upstream:

#### Pattern A: Vendor ships a CLI; we shell out to it directly

For Falcon (CrowdStrike's `falconctl` + Falcon REST API via `curl`), Trivy (`trivy`
CLI), Kubescape (`kubescape` CLI), GitHub (`gh` CLI), the agent shells out via
Pi's `Bash` capability. The Pi AGENTS.md for each agent documents the exact
invocation patterns:

```markdown
# AGENTS.md fragment for endpoint-containment-operator (Pi)

## Tools you may call

- `falcon-contain <host_id>`: wraps `curl -X POST $FALCON_BASE/devices/entities/devices-actions/v2 ...`
- `falcon-lift <host_id>`: wraps the un-contain action.
- `custody-append <event>`: foundation script; ALWAYS call this after any falcon-* invocation.

## Tools you MUST NOT call

- `rm`, `cp`, `mv` — file system mutation forbidden.
- Any `falcon-*` other than `contain` / `lift`.
- `curl` directly — go through the `falcon-*` wrappers so Cedar policy applies.
```

#### Pattern B: Vendor ships an MCP server; we CLI-Anything-wrap it for Pi

For Wazuh, MISP, TheHive, OpenCTI, Velociraptor, the upstream ships an MCP server
or one is community-maintained. Pi doesn't speak MCP; we run the MCP server out of
band (in the F2 gateway, or stand-alone), then expose a CLI shim — typically
`HKUDS/CLI-Anything` — that translates the agent's CLI call into an MCP call into
the gateway.

For each such tool, this package ships a thin Pi skill:

```
packages/team-security-response/skills/<skill>/
├── SKILL.md                            # canonical Pi form
├── pi-invocation.md                    # Pi prompts + tool surface
├── claude-code-invocation.md           # Claude Code MCP config
├── codex-invocation.md                 # Codex CLI tool config
├── copilot-invocation.md               # Copilot tool config (F5 fills)
├── gemini-invocation.md                # Gemini tool config (F5 fills)
└── opencode-invocation.md              # OpenCode tool config (F5 fills)
```

The SKILL.md leads with Pi. The other files are stubs in F4 and fully populated in F5.

### CLI-Anything wrap responsibility

Where the upstream MCP exists but Pi can't speak MCP, we ship a wrap recipe under
`mcp-recipes/` (cross-linked from F0) and a Pi skill that calls the wrapper. The
wrapper itself is **out of scope for F4** — F4 specifies the contract and the
F0 recipe documents the wrap; the actual wrap shipping happens as a follow-up
plan in late F4 or early F5.

For F4's v1, this package SHALL accept that **`malware-sandbox-submit`,
`case-management-thehive`, and `host-triage-velociraptor`** will work on Pi
**only after** the relevant wrap ships. The skills SHALL document this as a
"Pi support: pending wrap" banner at the top of the skill page until the wrap
lands. Claude Code and Codex variants of those three skills work in F4 because
they use MCP directly.

### Pi AGENTS.md per agent class

Each of the 11 agents gets a dedicated AGENTS.md fragment under
`packages/team-security-response/agents/<team-N>/<agent>.md`. The fragment is
authored for Pi first; the Claude Code "Agent / Skill" rendering is generated
from the same source by F5's `tools/pi-compat-layer/adapt.sh`.

### Pi SYSTEM.md addendum

A package-level `tools/pi-compat-layer/team-security-response/SYSTEM.md` ships
that the user can include in their Pi project. It contains the security team's
shared safety rules:

- "Never run a Falcon RTR `runscript` containing anything other than `kill -9 <PID>`."
- "Never run a Velociraptor VQL string containing `upload_file`, `remote_exec`, or `artifact_collect_with_exec`."
- "Never call any MISP / OpenCTI write tool unless the user has explicitly
  approved the write in the current turn."
- "Always call `custody-append` after any write-side tool, before returning to the user."

### Other hosts (F5 territory)

Claude Code, Codex CLI, GitHub Copilot, Cursor, Gemini, and OpenCode parity for this
package is **deferred to F5**. F4 ships:

- A working Pi-first skill + agent set.
- A Claude Code parity layer that works because Claude Code speaks MCP natively (the
  Cedar / gateway integration just routes through `mcpServers.opsbench-gateway`).
- Stubs (the `<host>-invocation.md` files) for the other hosts.

F5 fills the stubs and runs the per-host validate jobs.

---

## 8. Acceptance criteria

The F4 `team-security-response` package is considered shippable when **every**
criterion below is true:

### Package structure

- [ ] `packages/team-security-response/` exists with subdirs: `skills/`, `agents/`,
      `schemas/`, `policies/cedar/`, `mcp-recipes/`, `hooks/`, plus `README.md`.
- [ ] `packages/team-security-response/README.md` lists every skill, agent, schema,
      recipe, hook, and the Cedar role-mapping for each agent.

### Skills

- [ ] All 12 skills in §2 ship as `packages/team-security-response/skills/<id>/SKILL.md`.
- [ ] Each SKILL.md validates against the project's skill frontmatter schema (existing
      `tools/validate-skills.sh` or equivalent).
- [ ] Each SKILL.md has a Pi-first body and `*-invocation.md` stubs for the other
      hosts.
- [ ] Each SKILL.md cross-references at least one schema in §4.

### Agents

- [ ] All 11 agents in §3 ship as `agents/team-N-<group>/<agent>.md`.
- [ ] Each agent declares its Cedar role and default tool allowlist in YAML frontmatter.
- [ ] Each agent has a corresponding entry in `policies/cedar/role-bindings.cedar`.

### Schemas

- [ ] All 5 schemas in §4 ship as `schemas/<name>.schema.json` and validate as
      draft-2020-12.
- [ ] Each schema includes at least one valid `examples[]` entry.
- [ ] Cross-package: `evidence-envelope.schema.json` validates against
      `team-incident-response/schemas/custody-entry.schema.json` for its `chain[]`
      field.

### Cedar

- [ ] `policies/cedar/overrides.cedar` ships with the 5 overrides in §6.
- [ ] `policies/cedar/role-bindings.cedar` binds all 11 agents.
- [ ] `validate-cedar` CI job (from F1) passes for this package.

### MCP recipes

- [ ] `mcp-recipes/README.md` lists all 10 recipes in §5 with their cross-link target
      and the agents that use each.
- [ ] No recipe file is duplicated — only stubs / symlinks to F0-shipped canonical
      recipes.
- [ ] `mcp-recipes/SECURITY_NOTES.md` exists where the security posture differs from
      IR (Falcon `contain_only` mode is the headline example).

### Hooks

- [ ] `hooks/pre-tool-use.sh` exists; it adds security-domain redaction (IOC values
      treated as TLP:AMBER by default, secret-shaped strings redacted) to the
      foundation hook output.
- [ ] `hooks/post-tool-use.sh` exists; it appends a security-tagged custody.log
      entry on top of the foundation's append.
- [ ] Both hooks pass the existing `tools/validate-hooks.sh` check.

### Pi-first

- [ ] `tools/pi-compat-layer/team-security-response/SYSTEM.md` exists with the
      shared safety rules in §7.
- [ ] At least 9 of 12 skills work end-to-end on Pi in F4 (the 3 exceptions —
      sandbox / TheHive / Velociraptor — ship as "Pi support: pending wrap").
- [ ] All 12 skills work on Claude Code via the gateway.

### Documentation

- [ ] `docs/integrations.md` gains a "team-security-response" section that maps
      every recipe to the agents that use it.
- [ ] The team README documents the install flow (Pi-first, then "also on Claude
      Code") and the Cedar role roster.

### CI

- [ ] `lint:md`, `lint:cedar`, `lint:schema`, `lint:skills`, `lint:hooks` all pass.
- [ ] No CI job duplication — this package reuses the existing
      `team-incident-response` job names with the new package path as input.

### Ship gates

- [ ] One PR titled `feat(team-security-response): F4 team package on the foundation`.
- [ ] PR description cross-references this spec doc and the F-series roadmap.
- [ ] Reviewer signoff before merge.

---

## 9. Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
| - | ---- | ---------- | ------ | ---------- |
| 1 | CrowdStrike Falcon RTR is a *write* tool family with broad blast radius; a misconfigured Cedar override could allow `runscript` to run anything. | Medium | Critical | The `overrides.cedar` Falcon rule §6.1 uses a strict regex. The implementation plan SHALL include a Cedar unit-test suite that runs the override against a fuzzed command set (100+ command shapes) and fails the build if any non-`kill -9` command is allowed. |
| 2 | Velociraptor's VQL grammar is wider than our regex. A clever VQL string could side-step the §6.2 deny. | Medium | High | The implementation plan SHALL ship a Velociraptor VQL parser shim (likely a thin wrapper around `velociraptor query --dry_run`) that the gateway runs before evaluating Cedar; only if the dry-run reports no write effects does Cedar even see the request. |
| 3 | Pi can't speak MCP natively. The CLI-Anything wraps required for §5's TheHive / Velociraptor / sandbox skills aren't in scope for F4. | High | Medium | Documented banner on the affected skills (§7). F4 ships Pi support for the 9 skills whose tools are pure CLI. Wraps land in a follow-up plan owned by this package's maintainer. |
| 4 | TheHive's `EXPERIMENTAL` MCP wrapper (inherited banner from old P1) may break case-management workflows. | Medium | Medium | The skill `case-management-thehive` SHALL detect MCP errors and degrade gracefully to "log the case change to custody.log; emit a warning that TheHive sync failed; surface in the report". |
| 5 | Falcon detect → contain latency. Network containment must apply within seconds of triage. If the gateway adds significant latency (Cedar eval + custody write + receipt sign), the user could lose the host. | Medium | High | The implementation plan SHALL benchmark Falcon contain end-to-end latency through the gateway and target ≤1.5s p95. If breached, document the fast-path option (direct Falcon SDK with custody-only receipt, no Cedar eval at write time — receipt verification still works after the fact). |
| 6 | IOC enrichment via MISP / OpenCTI may leak observables to the upstream MCP servers' internal logs. | Medium | Medium | The pre-tool-use hook (§criteria/Hooks) SHALL TLP-tag every IOC at TLP:AMBER by default and refuse to pivot any observable explicitly tagged TLP:RED. |
| 7 | Trivy / Kubescape may surface CVEs the user can't act on (e.g., third-party SaaS). The CVE impact analyst could overwhelm the commander. | Low | Low | The `cve-impact-trivy` skill output schema SHALL include a `workload_owned` boolean; the analyst SHALL filter to `workload_owned: true` before surfacing to the commander. |
| 8 | Cedar generator drift — if F1's generator changes the `tools-generated.cedar` shape, our overrides may misbehave. | Low | Medium | The package's CI SHALL run `cedar validate` against the *combined* file (generated + overrides) on every change to either F1 or this package. |
| 9 | A SOC-only org installs this package without `team-incident-response` and the cross-references break. | Medium | Medium | §2's "self-contained" constraint. Implementation plan SHALL include an install-time check that warns (but does not block) if `team-incident-response` is absent. |
| 10 | Pi marketplace listing latency (covered in F5) means the Pi-first install path may not exist when F4 lands. | High | Low | F4 acceptance criteria call out Pi support via direct `pi install git:...` invocation; marketplace listing is F5's concern. Users can still install via the direct path. |

---

## 10. Open questions

To be resolved before the F4 `team-security-response` implementation plan is written.

1. **TheHive 5 vs TheHive 4.** The inherited recipe was authored against TheHive 4.
   TheHive 5 ships a different API surface (and a different license posture —
   StrangeBee took the commercial route). Do we pin to v4 indefinitely (Cortex-XSOAR-style),
   migrate to v5, or support both behind a `thehive_version` config flag? **Recommendation:**
   v5 with a v4 compat shim, on a 3-month deferral if the MCP wrapper is unstable.
2. **Sandbox vendor.** Joe Sandbox is the catalog's first-class entry; Hatching Triage
   and Cuckoo (FOSS) are alternatives. Do we pick one and ship a single recipe, or
   abstract over the three behind a sandbox role? **Recommendation:** single Joe Sandbox
   recipe in F4; abstract in F4.5 if a user requests it.
3. **Falcon vs SentinelOne vs Defender for Endpoint.** Falcon is the catalog's strongest
   EDR MCP, but Microsoft Defender for Endpoint has a vendor MCP (via `microsoft/mcp`)
   and SentinelOne is reachable via CLI-Anything. Do we ship Falcon as the only
   first-class containment skill, or build an `endpoint-containment-*` skill family
   with one skill per EDR? **Recommendation:** Falcon-first in F4, Defender family member
   added in F4.5 (uses the `microsoft/mcp` recipe shipped in F0).
4. **MISP vs OpenCTI primacy.** The two systems overlap heavily on IOC graphs.
   Should the package treat them as equally first-class (current §3 plan), or
   declare OpenCTI primary and MISP secondary? **Recommendation:** equally first-class
   in F4; revisit after one cycle of real use.
5. **Sigma rule generation.** Several SOC stacks (Wazuh, Falcon) can ingest Sigma rules.
   Should the package ship a `sigma-rule-author` skill that turns IOC bundles into
   detection rules? **Recommendation:** out of scope for F4; consider for F4.5 or a
   future detection-engineering team package.
6. **Containment human-in-the-loop UX.** Cedar denies containment without a
   `triage_verdict_id`; what's the UX for the commander affirming a verdict and
   passing the affirmation token to the containment operator? **Open** — depends on
   the F2 gateway's affirmation surface, which itself is still being designed.
7. **Schema versioning.** The schemas are `v1` from day one. What's the upgrade path
   when a field is added — `v1.1` (semver-style) or `v2` (breaking)? **Recommendation:**
   semver in the schema body, frozen `$id` URI for the first 12 months; if a
   breaking change is needed, mint a `v2.schema.json` with a new `$id`.
8. **TLP marking enforcement.** §9.6 mentions TLP:RED refusal. Where does TLP marking
   live — observable-level (in the `ioc-bundle` schema), bundle-level, or both?
   **Recommendation:** both, with the bundle's TLP as a floor (max of the bundle TLP and
   each observable's TLP).
9. **`team-it-helpdesk` cross-team policy.** §5 calls out a possible read-only
   cross-team Cedar policy for identity logs. Does this land in F4
   `team-security-response`, or does it live in `team-it-helpdesk`? **Recommendation:**
   land in `team-it-helpdesk` (whose maintainer owns the identity surface), with this
   package's documentation pointing at it.
10. **Naming.** "team-security-response" parallels "team-incident-response" but is
    arguably wide — it covers detection, response, threat-intel, and posture. Should
    we split into `team-security-soc` + `team-security-posture` in v2? **Open** —
    park as a F-series follow-up; do not block F4 on it.

---

## 11. Out of scope (parking lot)

The following items are **explicitly excluded** from F4 `team-security-response` and
captured here so reviewers don't think they were forgotten.

- **SOAR-style multi-playbook fan-out.** Out of scope; would warrant a separate phase.
- **Detection engineering** (Sigma rule authoring, KQL composition). Out of scope;
  see §10.5.
- **Vulnerability management workflow** (ticketing, patch cadence). Lives in
  `team-platform-engineering`.
- **Identity threat detection** (suspicious login analytics). Lives in
  `team-it-helpdesk`'s identity surface.
- **Cluster-level isolation** (NetworkPolicy install, namespace lockdown). Lives in
  `team-incident-response`'s `incident-quarantine` skill.
- **Packet capture + protocol analysis.** Lives in `team-network-operations`.
- **Real-time SOC console / dashboard UI.** This package is agent-side only.
- **Active deception / honeytoken management.** Future team package candidate.
- **Cloud workload protection (CWPP)** — Sysdig / Aqua / Lacework. The catalog
  notes these but the MCP surface isn't mature enough for F4; revisit in F6.
- **SIEM rule deployment** (Wazuh rule push, Splunk savedsearch sync). Read-only
  Wazuh consumption is in scope; rule deployment is not.

---

## 12. Appendix — file layout preview

For the implementation plan author's convenience, the expected post-merge file tree:

```
packages/team-security-response/
├── README.md
├── agents/
│   ├── team-1-command/
│   │   └── security-incident-commander.md
│   ├── team-2-triage-enrichment/
│   │   ├── alert-triage-analyst.md
│   │   ├── ioc-enrichment-analyst.md
│   │   └── threat-attribution-analyst.md
│   ├── team-3-containment-forensics/
│   │   ├── endpoint-containment-operator.md
│   │   ├── process-killer-operator.md
│   │   ├── host-forensics-collector.md
│   │   └── sandbox-submitter.md
│   ├── team-4-posture-supply-chain/
│   │   ├── cve-impact-analyst.md
│   │   └── kubernetes-posture-analyst.md
│   └── team-5-reporting/
│       └── security-report-writer.md
├── hooks/
│   ├── pre-tool-use.sh
│   └── post-tool-use.sh
├── mcp-recipes/
│   ├── README.md
│   ├── SECURITY_NOTES.md
│   ├── wazuh-mcp.md                  # symlink / stub
│   ├── misp-mcp.md                   # symlink / stub
│   ├── thehive-mcp.md                # symlink / stub
│   ├── opencti-mcp.md                # symlink / stub
│   ├── velociraptor-mcp.md           # symlink / stub
│   ├── crowdstrike-falcon-mcp.md     # symlink / stub
│   ├── trivy-mcp.md                  # symlink / stub
│   ├── kubescape-mcp.md              # symlink / stub
│   ├── github-mcp.md                 # symlink / stub
│   └── sandbox-cli-wrap.md           # symlink / stub (deferred wrap)
├── policies/
│   └── cedar/
│       ├── README.md
│       ├── overrides.cedar
│       └── role-bindings.cedar
├── schemas/
│   ├── triage-verdict.schema.json
│   ├── ioc-bundle.schema.json
│   ├── containment-action.schema.json
│   ├── evidence-envelope.schema.json
│   └── security-incident-report.schema.json
└── skills/
    ├── security-alert-triage/
    │   ├── SKILL.md
    │   ├── pi-invocation.md
    │   ├── claude-code-invocation.md
    │   ├── codex-invocation.md
    │   ├── copilot-invocation.md
    │   ├── gemini-invocation.md
    │   └── opencode-invocation.md
    ├── ioc-enrichment/                       (same per-host fanout)
    ├── case-management-thehive/
    ├── host-triage-velociraptor/
    ├── endpoint-containment-falcon/
    ├── malware-sandbox-submit/
    ├── cve-impact-trivy/
    ├── kubernetes-posture-kubescape/
    ├── supply-chain-incident/
    ├── threat-actor-attribution/
    ├── security-incident-report/
    └── security-playbook-runner/

tools/pi-compat-layer/team-security-response/
└── SYSTEM.md
```

---

## End of spec

When this spec is approved:

1. Move to brainstorming-pass on the implementation plan (per F-series principle:
   spec → brainstorm → plan → implement).
2. The plan author owns answering the §10 open questions before plan land.
3. Implementation lands as a single PR titled `feat(team-security-response): F4
   team package on the foundation`, optionally split by reviewer request into
   (schemas + Cedar) / (agents + hooks) / (skills) sub-PRs.
4. F4-sibling specs (`team-platform-engineering`, `team-network-operations`,
   `team-data-platform`, `team-it-helpdesk`) follow the same shape.
