# F4 — `team-network-operations` — Design

**Status:** draft 2026-06-04 — awaiting reviewer approval
**Author:** Claude Code session (Shaik Noorullah, driver)
**Parent roadmap:** [`./2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md) (F4 section, sub-team 3 of 5)
**Sibling team specs (cross-link only, not dependencies):**

- `team-platform-engineering` (F4 sub-team 1) — overlaps on Cilium/Istio cluster ops
- `team-security-response` (F4 sub-team 2) — overlaps on Tetragon, Falco, eBPF runtime
- `team-data-platform` (F4 sub-team 4)
- `team-it-helpdesk` (F4 sub-team 5)

**Inputs:**

- [`../research/2026-06-04-ecosystem-catalog.md`](../research/2026-06-04-ecosystem-catalog.md) — § "network-diag", § "service-mesh", § "ingress-and-gateway", § 7.5 ("eBPF is now the default substrate for network/runtime forensics"). The catalog flagged Inspektor Gadget, Kubeshark, Cilium pwru/Hubble/Tetragon, Microsoft Retina, Pixie, kguardian, ksniff, netshoot, Istio/Linkerd CLIs, WireMCP, and the kagent-dev/tools multi-tool MCP as the high-fit candidates for a network-ops team.
- [`./2026-06-04-f1-design.md`](./2026-06-04-f1-design.md) — every Cedar allowlist in this package is derived by F1's `scripts/generate-cedar-policy.sh` from the team's `mcp-recipes/*.md` `tools:` frontmatter blocks; hand-written rules live in `policies/tools.cedar` (small).
- [`./2026-06-04-f2-design.md`](./2026-06-04-f2-design.md) — all recipes in this package route through `opsbench-gateway` by default; eBPF-heavy MCPs (Inspektor Gadget, Kubeshark) get the gateway's per-upstream `capabilities` allowlist locked down to read-only gadgets.
- [`./2026-06-04-f3-design.md`](./2026-06-04-f3-design.md) — every gadget run, pcap capture, mesh-config dump, and DNS-forensics query emits a signed receipt; offline replay of an incident is a verified chain of receipts.
- Existing `packages/team-incident-response/` as the structural template (skills/, agents/, schemas/, policies/, mcp-recipes/, hooks/, teams/, README.md).

## 1. Purpose

`team-network-operations` is the F4 team package that owns **network-plane forensics, mesh introspection, and DNS / east-west traffic investigation** on Kubernetes and Linux hosts. It is the package an on-call SRE reaches for when "is the cluster's east-west traffic right?" is the question — and where an incident-response orchestrator delegates when the working hypothesis is "the problem is in the network, not the app".

Three trends from the ecosystem catalog shape this package:

1. **eBPF is the substrate.** The catalog confirmed eBPF (Inspektor Gadget, Kubeshark, Cilium pwru/Hubble/Tetragon, Microsoft Retina, Pixie) is the default mechanism for L3–L7 forensics in 2026. Vendor MCPs already exist for Inspektor Gadget and Kubeshark; the others ship as CLIs that we wrap via `cli-anything-wrap`. We do **not** rewrite any of these tools — we orchestrate them.
2. **Service mesh is bifurcated.** Istio Ambient + ztunnel and Cilium Service Mesh on eBPF have split the mesh world; sidecar-Istio is still the dominant install base. No vendor has shipped a first-party mesh MCP, so `team-network-operations` ships read-only Istio/Linkerd/Hubble MCP recipes via the kagent-dev/tools multi-tool wrapper and the krutsko/istio-mcp-server fork.
3. **DNS forensics is under-served.** Cluster-internal DNS (CoreDNS, Cilium-DNS-resolver, NodeLocal DNSCache) is the most common silent failure mode and the most under-documented in MCP form. This package ships dedicated DNS-forensics skills and a DNS-incident schema.

The package is **thin by design** because F0–F3 already supplied:

- the vendor MCP recipes (Inspektor Gadget, Kubeshark already curated in F0),
- the Cedar generator (F1),
- the gateway and per-upstream `capabilities` (F2),
- the signed-receipt chain that ties pcap captures, gadget output, and mesh-config dumps into one verifiable forensic bundle (F3).

What `team-network-operations` adds on top is: skill-and-agent choreography for network-only incidents, the mesh-and-DNS schemas, the team-scope Cedar overrides (a small set of high-leverage Deny rules), and a curated subset of network-relevant recipes that link back to the F0 catalog rather than duplicate it.

## 2. Skill inventory

Target band: 8–15 skills. This spec lands **11 skills** organised into four sub-domains: eBPF forensics (4), mesh introspection (3), DNS forensics (2), traffic capture & replay (2).

| # | Skill | One-line description | Sub-domain |
|---|-------|----------------------|-----------|
| 1 | `ebpf-gadget-runner` | Run a chosen Inspektor Gadget gadget (`trace_dns`, `trace_tcpconnect`, `trace_oomkill`, …) against a node-or-pod scope, write JSONL output to the evidence dir, attach to the signed receipt chain. | eBPF forensics |
| 2 | `kubeshark-tap-window` | Open a time-bounded Kubeshark capture window (default 60 s) against a namespace selector, persist the pcap + tap-API JSON, emit a `kubeshark-capture` artifact, tear down the tap on exit. | eBPF forensics |
| 3 | `pwru-packet-trace` | Run `cilium/pwru` against a 5-tuple (src/dst IP + port + proto) for a kernel-side packet-path trace; cap-restrict the run via Cedar `Action::"network::pwru::run"`; output is one `pwru-trace.jsonl` per invocation. | eBPF forensics |
| 4 | `tetragon-flow-observer` | Subscribe to `cilium/tetragon` events filtered by namespace + process-name; collect ≤ N events or until window expires; emit `tetragon-events.jsonl`. Read-only; never mutates tracing policies. | eBPF forensics |
| 5 | `istio-config-snapshot` | Dump `istioctl proxy-config` (`clusters`, `routes`, `listeners`, `endpoints`, `secrets`) for a given pod, diff against the cluster's effective `VirtualService`/`DestinationRule`/`AuthorizationPolicy`, emit `istio-snapshot-<pod>.json`. Read-only via krutsko/istio-mcp-server. | Mesh introspection |
| 6 | `linkerd-tap-and-trace` | Run `linkerd viz tap` against a workload selector and emit `linkerd-tap.jsonl`; pair with `linkerd diagnostics endpoints` for routing-table snapshot. Read-only. | Mesh introspection |
| 7 | `hubble-flow-observer` | Run `hubble observe --output=jsonl --since=<dur> --until=<dur>` with namespace + verdict filters; produce `hubble-flows.jsonl` and a small `hubble-summary.json` (top-N drops, top-N L7 errors). | Mesh introspection |
| 8 | `dns-resolution-probe` | Probe in-cluster DNS (`CoreDNS`, `NodeLocalDNS`, `cilium-dns`) end-to-end from a chosen pod using a netshoot ephemeral container; correlate `dig +trace` output with Inspektor Gadget `trace_dns` for the same window; emit `dns-probe-report.json`. | DNS forensics |
| 9 | `dns-cache-poisoning-check` | Cross-check `CoreDNS` `forward` plugin upstreams against authoritative records for a chosen domain; flag NXDOMAIN amplification, response anomalies, suspicious TTL skews; emit a `dns-incident-finding.json` per finding. Read-only network access via Cedar. | DNS forensics |
| 10 | `pcap-capture-and-seal` | Spawn an ephemeral debug-container (`nicolaka/netshoot` image, pinned-digest) on a target node or pod, run `tcpdump` with a BPF filter for a time-bounded window, write the pcap to `$INCIDENT_DIR/captures/`, hash + sign via F3 receipt chain. Capture size capped via Cedar (`max_bytes_capture`). | Traffic capture & replay |
| 11 | `tshark-pcap-analyze` | Run `tshark` (via the WireMCP-derived wrapper) against a sealed pcap to extract a small set of pre-defined analyses: top-N talkers, top-N protocols, top-N TLS-SNIs, top-N HTTP/2 streams; output a single `pcap-analysis.json`. Pcap is read-only; the skill never re-writes the pcap. | Traffic capture & replay |

**Skill frontmatter convention** (mirroring `team-incident-response`):

```yaml
---
id: ebpf-gadget-runner
team: team-network-operations
sub_team: team-1-ebpf-forensics
agent_class: collector
mode: read-only
hosts: [pi, claude-code, codex, copilot, cursor, gemini, opencode]
mcp_recipes:
  - inspektor-gadget-mcp.md
schemas:
  output: network-finding.schema.json
gateway:
  required: true
  upstream_id: inspektor-gadget
cedar:
  generated: true            # the actual Allow rules come from tools-generated.cedar (F1)
  overrides_file: policies/team-network-operations.cedar
---
```

The full Pi-first authoring note for each skill is in § 8.

## 3. Agent inventory

Target band: 5–15 agents organised into team-N sub-groups (mirroring `team-incident-response`'s `team-1-command`, `team-2-evidence-collection`, etc.). This spec lands **10 agents in 4 sub-teams**.

### team-1-orchestration (1 agent)

| Agent | Capability | Default tool allowlist (via Cedar) |
|-------|-----------|-----------------------------------|
| `network-incident-orchestrator` | Top-level orchestrator for any incident whose working hypothesis lives in the network plane. Reads the current `incident-report.json` (from `team-incident-response`'s schema, cross-package), decides which sub-team to fan out to, collects sub-team outputs, writes a `network-incident-summary.json`. | `Allow` only `Action::"network::skill::invoke"` for the `collector`/`analyzer` agents below; explicit `Forbid` on every mutation action in the package; `Allow` `Action::"opsbench::write_artifact"` for the summary file only. |

### team-2-ebpf-forensics (3 agents)

| Agent | Capability | Default tool allowlist |
|-------|-----------|------------------------|
| `gadget-driver` | Picks the right Inspektor Gadget gadget for a given hypothesis (DNS slowness → `trace_dns`; connection storms → `trace_tcpconnect`; weird sockets → `trace_tcpdrop`; OOM → `trace_oomkill`). Wraps `ebpf-gadget-runner` skill calls in a small decision tree. | `Allow Action::"inspektor-gadget::run-gadget"` for the gadget list in `tools-generated.cedar`; `Forbid Action::"inspektor-gadget::install-policy"`. |
| `kubeshark-tap-coordinator` | Owns Kubeshark's tap lifecycle: install (via Helm chart, idempotent), run a tap window, persist pcap + JSON, tear down. Refuses to leave a tap running past the window. | `Allow Action::"kubeshark::tap-start"` and `Action::"kubeshark::tap-stop"`; `Forbid Action::"kubeshark::license-set"`. |
| `kernel-trace-analyst` | Runs `pwru-packet-trace` and `tetragon-flow-observer` skills, normalises the outputs into a single `kernel-trace-events.jsonl` keyed by ts. | `Allow Action::"cilium::pwru::run"`; `Allow Action::"tetragon::events-read"`; `Forbid Action::"tetragon::policy-write"`. |

### team-3-mesh-introspection (3 agents)

| Agent | Capability | Default tool allowlist |
|-------|-----------|------------------------|
| `istio-snapshot-collector` | Owns `istio-config-snapshot` skill across a list of pods; coalesces the per-pod snapshots into one `istio-mesh-snapshot.json` for the incident window. | `Allow Action::"istioctl::proxy-config-read"`; `Forbid Action::"istioctl::install"`; `Forbid Action::"istioctl::upgrade"`. |
| `linkerd-tap-coordinator` | Owns `linkerd-tap-and-trace` skill; refuses to run against namespaces not in the incident scope; redacts request bodies to header-only by default. | `Allow Action::"linkerd::viz-tap-read"`; `Allow Action::"linkerd::diag-read"`; `Forbid Action::"linkerd::install"`. |
| `hubble-flow-collector` | Owns `hubble-flow-observer` skill, plus the post-collection summary (top-N drops, top-N L7 errors, identity-mismatch counts). | `Allow Action::"hubble::observe"`; `Forbid Action::"cilium::config-write"`. |

### team-4-dns-forensics (2 agents)

| Agent | Capability | Default tool allowlist |
|-------|-----------|------------------------|
| `dns-probe-driver` | Runs the `dns-resolution-probe` skill against a chosen pod scope, then asks `gadget-driver` to run `trace_dns` for the same window; correlates both into a `dns-probe-report.json`. | `Allow Action::"netshoot::ephemeral-spawn"` (capped via Cedar `max_duration` + `max_pods`); `Allow Action::"inspektor-gadget::trace-dns"`. |
| `dns-policy-auditor` | Runs `dns-cache-poisoning-check` across a configured domain list (per `dns-incident-finding.schema.json`); writes one finding per anomaly; never edits CoreDNS config. | `Allow Action::"dns::resolve"`; `Allow Action::"coredns::config-read"`; `Forbid Action::"coredns::config-write"`. |

### team-5-traffic-capture (1 agent)

| Agent | Capability | Default tool allowlist |
|-------|-----------|------------------------|
| `pcap-capture-driver` | Owns `pcap-capture-and-seal` and `tshark-pcap-analyze` skills; enforces the capture-size cap; pairs each pcap with a signed receipt chain spanning capture-start → capture-stop → analyze. | `Allow Action::"netshoot::tcpdump-run"`; `Allow Action::"wiremcp::tshark-analyze"`; `Forbid` everything else. |

**Agent prompt convention.** Each agent's prompt opens with a `gateway_required: true` line (forces routing through opsbench-gateway), declares its allowed actions explicitly, references the skill IDs it owns, and forbids out-of-package skills unless invoked through the cross-package `team-incident-response::evidence-cataloger` adapter (so `team-network-operations` outputs can be folded back into the incident timeline).

## 4. Schemas

Target band: 3–6 JSON schemas (draft 2020-12). This spec lands **5 schemas**, kept small to avoid duplicating `team-incident-response`'s shapes.

### 4.1 `network-finding.schema.json`

Canonical envelope every skill in this package emits. Embeds (via `$ref`) the F3 receipt envelope when run through the gateway.

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://opsbench.dev/schemas/team-network-operations/network-finding.v1.json",
  "title": "NetworkFinding",
  "type": "object",
  "additionalProperties": false,
  "required": ["finding_id", "produced_by_skill", "kind", "scope", "summary", "evidence", "ts"],
  "properties": {
    "finding_id": { "type": "string", "pattern": "^nf-[a-f0-9]{16}$" },
    "produced_by_skill": { "type": "string" },
    "produced_by_agent": { "type": "string" },
    "kind": {
      "enum": [
        "ebpf-trace", "kubeshark-capture", "pwru-trace", "tetragon-events",
        "istio-snapshot", "linkerd-tap", "hubble-flow-summary",
        "dns-probe", "dns-incident", "pcap-capture", "pcap-analysis"
      ]
    },
    "scope": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "cluster": { "type": "string" },
        "namespaces": { "type": "array", "items": { "type": "string" } },
        "pods": { "type": "array", "items": { "type": "string" } },
        "nodes": { "type": "array", "items": { "type": "string" } },
        "selectors": { "type": "object", "additionalProperties": true }
      }
    },
    "window": {
      "type": "object",
      "properties": {
        "start": { "type": "string", "format": "date-time" },
        "end":   { "type": "string", "format": "date-time" }
      }
    },
    "summary": { "type": "string", "maxLength": 4096 },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "sha256"],
        "properties": {
          "path":   { "type": "string" },
          "sha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
          "kind":   { "type": "string" },
          "bytes":  { "type": "integer", "minimum": 0 }
        }
      }
    },
    "receipt_ref": { "type": "string", "description": "SHA-256 of the F3 receipt that signed this finding (matches receipt.signed_payload_canonical_sha256)." },
    "ts": { "type": "string", "format": "date-time" }
  }
}
```

### 4.2 `mesh-snapshot.schema.json`

Container for `istio-snapshot-collector` and `hubble-flow-collector` outputs. Carries an optional pointer to a sibling `network-finding.json`.

Key fields: `mesh_kind` (`istio` | `linkerd` | `cilium-mesh`), `version`, `per_pod_snapshots[]` (with diffs against effective CR), `routing_table_summary{}`, `auth_summary{}` (mTLS posture + authn/authz outliers), `top_n_routes_by_error_rate[]`.

### 4.3 `dns-incident-finding.schema.json`

One per anomaly emitted by `dns-policy-auditor` / `dns-probe-driver`.

Key fields: `domain`, `expected_authoritative[]`, `observed_resolver[]`, `anomaly_class` (`nxdomain-amplification` | `ttl-skew` | `upstream-divergence` | `cache-poisoning-suspect` | `coredns-forwarder-mismatch` | `cilium-resolver-divergence`), `severity` (`info`|`warn`|`crit`), `evidence_paths[]`, `remediation_hint` (free-form string, advisory only — never machine-executed).

### 4.4 `pcap-capture-manifest.schema.json`

One per pcap that lands in `$INCIDENT_DIR/captures/`. Tracks capture parameters so an analyst can reproduce or audit.

Key fields: `pcap_path`, `pcap_sha256`, `bpf_filter`, `iface`, `node_or_pod_target`, `started_at`, `ended_at`, `bytes_captured`, `was_truncated` (bool), `redaction_applied[]` (list of post-capture redactions, e.g. "tls-handshake-only"), `chain_of_receipts[]` (list of F3 receipt sha256s in capture-start → capture-stop → analyze order).

### 4.5 `ebpf-trace-event.schema.json`

Per-line schema for the JSONL outputs from `ebpf-gadget-runner`, `pwru-packet-trace`, `tetragon-flow-observer`. Small, narrow, designed to be appended at high rate without re-validating each line at write time.

Key fields: `ts` (ns precision), `event_kind` (`gadget` | `pwru` | `tetragon`), `tool_specific` (object passed through unmodified by opsbench — schema is a sane upper bound, not a translation layer), `node`, `pod` (optional), `pid` (optional).

**Not in this package** (cross-link only):

- `custody-entry.schema.json`, `receipt.v1.json` — inherited from `team-incident-response/schemas/` (F2/F3).
- `incident-report.schema.json`, `timeline-entry.schema.json` — owned by `team-incident-response`; this package's `network-incident-summary.json` produced by `network-incident-orchestrator` is reduced to a `timeline-entry` via the cataloging adapter.

## 5. MCP recipes (curated subset)

These are the network-relevant recipes from the F0 bulk-ship catalog. They live in `packages/team-incident-response/mcp-recipes/` (the F0 home); this team **cross-links** rather than duplicates.

### 5.1 Curated subset (cross-link, not duplicate)

| Recipe (lives in `team-incident-response/mcp-recipes/`) | Used by skill(s) | Used by agent(s) |
|---|---|---|
| `inspektor-gadget-mcp.md` | `ebpf-gadget-runner`, `dns-resolution-probe` (correlated DNS gadget) | `gadget-driver`, `dns-probe-driver` |
| `kubeshark-mcp.md` | `kubeshark-tap-window` | `kubeshark-tap-coordinator` |
| `kubernetes-cli-bridge-mcp.md` (alexei-led/k8s-mcp-server) | `pcap-capture-and-seal` (for `kubectl debug --image=netshoot`), `dns-resolution-probe` | `pcap-capture-driver`, `dns-probe-driver` |
| `grafana-mcp.md` | (read-only) `hubble-flow-observer` summary correlation when Grafana hosts the Hubble dashboards | `hubble-flow-collector` |
| `prometheus-mcp.md` | (read-only) `hubble-flow-observer`, `istio-config-snapshot` for control-plane health correlation | `hubble-flow-collector`, `istio-snapshot-collector` |
| `loki-mcp.md` | DNS forensics correlation against CoreDNS logs | `dns-policy-auditor`, `dns-probe-driver` |
| `signoz-mcp.md` / `otel-mcp.md` (one of) | mesh-trace correlation when the cluster ships traces to SigNoz or Tempo | `istio-snapshot-collector`, `linkerd-tap-coordinator` |

### 5.2 New recipes this package owns (live under `team-network-operations/mcp-recipes/`)

| Recipe | Upstream | Integration vector | Notes |
|---|---|---|---|
| `cilium-pwru-cli.md` | `cilium/pwru` (Apache-2.0) | `cli-anything-wrap` | Wraps `pwru` as a Pi-callable CLI; Cedar Deny on `--kprobe` write modes; capture-window cap. |
| `cilium-hubble-cli.md` | `cilium/hubble` (Apache-2.0) | `cli-anything-wrap` | Read-only `hubble observe` + `hubble status`; Cedar Deny on `hubble config set`. |
| `cilium-tetragon-cli.md` | `cilium/tetragon` (Apache-2.0) | `cli-anything-wrap` | Subscribes to events only; tracing-policy install path is `Forbid` by default. |
| `istioctl-cli.md` | `istio/istio` (Apache-2.0) | `cli-anything-wrap` | Whitelisted to `proxy-config` and `analyze`; `install` / `upgrade` denied. |
| `linkerd-cli.md` | `linkerd/linkerd2` (Apache-2.0) | `skill` (Linkerd CLI is already shell-friendly) | Whitelisted to `viz tap`, `diagnostics`, `check`; `install` denied. |
| `kagent-tools-mcp.md` | `kagent-dev/tools` (Apache-2.0) | `mcp-recipe` | The "all-in-one" K8s/Helm/Istio/Cilium/Prom/Grafana/Argo MCP; we use the read-only subset only; Cedar Deny list documented in the recipe. |
| `wiremcp-tshark.md` | `0xKoda/WireMCP` (MIT, borderline-stale; fork pinned) | `mcp-recipe` | tshark pcap analysis MCP; ships as opsbench-pinned fork to insulate from upstream rot. |
| `microsoft-retina-cli.md` | `microsoft/retina` (MIT) | `cli-anything-wrap` | AKS-flavoured eBPF observability; capture-to-blob path is `Forbid` by default outside AKS. |
| `ksniff-cli.md` | `eldadru/ksniff` (Apache-2.0) | `cli-anything-wrap` | Canonical pod-tcpdump bridge; bounded by `pcap-capture-and-seal`'s size cap. |
| `netshoot-image.md` | `nicolaka/netshoot` (Apache-2.0) | reference / image pin | Documents the pinned-digest used by `pcap-capture-and-seal` and `dns-resolution-probe`. |

The split is deliberate: the **vendor MCPs that already live in the catalog** stay where they are (F0 home); the **network-only CLI wrappers** live with this team because they have no other consumer.

## 6. Cedar policy posture

The package keeps its hand-written Cedar surface deliberately small. The bulk of the allow/deny matrix is generated by F1 from the `tools:` frontmatter on each recipe (both the curated subset above and the new recipes this team owns).

### 6.1 What lives in `policies/team-network-operations.cedar` (small)

- **Default-deny envelope.** `forbid (principal in Group::"network-operations-agents", action, resource);` — closes the world; F1's generator-produced `Allow` rules unlock specific tools.
- **Mutation guard.** A small set of explicit `forbid` rules with `when` clauses that re-deny any tool that *looks* read-only but has a mutating mode (e.g. `hubble config set`, `istioctl install`, `tetragon tracingpolicy create`). These are the high-leverage overrides that catch the easy mistakes.
- **Capture-size cap.** `forbid (principal, action == Action::"network::pcap::capture", resource) when { context.requested_bytes > resource.max_capture_bytes };` — the `pcap-capture-driver` is the only allowed caller and the cap is per-incident config.
- **Window cap.** `forbid (principal, action == Action::"kubeshark::tap-start", resource) when { context.requested_window_seconds > 600 };` — caps Kubeshark taps at 10 min to prevent unbounded captures from leaking through a poorly-chosen prompt.
- **Out-of-scope namespace fence.** `forbid (principal, action, resource) when { !resource.namespace in context.incident_scope.namespaces };` — every collector agent must declare its incident-scope namespaces; calls outside the scope are denied.
- **Cross-package promotion.** `permit (principal == Agent::"team-incident-response::evidence-cataloger", action == Action::"opsbench::read_artifact", resource) when { resource.team == "team-network-operations" };` — the only sanctioned read-out of this package's artifacts into the incident bundle.

### 6.2 What lives in `tools-generated.cedar` (F1, large)

Per-skill / per-agent `Allow` rules generated from each recipe's `tools:` block. For example, `inspektor-gadget-mcp.md` declares `tools: [run-gadget(read-only), list-gadgets, attach, detach]`; the generator emits `permit (principal == Agent::"network-operations::gadget-driver", action == Action::"inspektor-gadget::run-gadget", resource) when { context.gadget_class == "trace-*" };`. The team package never hand-writes these.

### 6.3 Per-incident overlays

The orchestrator (`network-incident-orchestrator`) writes a per-incident overlay file `policies/incident-<id>.cedar` declaring the in-scope namespaces, pcap-cap, and Kubeshark window. The gateway loads this overlay alongside `tools.cedar` + `tools-generated.cedar`. The overlay is signed via F3 (the orchestrator's startup emits a receipt with `decision: "allow", action: "opsbench::write_policy_overlay"`) so the audit trail records who scoped the incident.

### 6.4 Schema-derived gates

`opsbench-schema.cedarschema.json` (F2 file) gets the following new `Action`s registered:
`network::pcap::capture`, `network::pcap::analyze`, `inspektor-gadget::run-gadget`, `kubeshark::tap-start`, `kubeshark::tap-stop`, `cilium::pwru::run`, `tetragon::events-read`, `istioctl::proxy-config-read`, `linkerd::viz-tap-read`, `hubble::observe`, `dns::resolve`, `coredns::config-read`. Each is annotated with the redaction profile required (e.g. `pcap-capture` requires `redact_tls_handshake_only` on the response).

## 7. Hooks

The package ships a minimal `hooks/` directory because F0–F3 supply the heavy lift:

- `hooks/pre-tool-use.sh` — thin wrapper that calls `team-incident-response/hooks/pre-tool-use.sh` (the canonical implementation) and adds two checks specific to this team:
  1. refuses to run pcap-capture skills if `$INCIDENT_DIR/captures/` is not on the same filesystem as `$INCIDENT_DIR` (avoids tmpfs surprises);
  2. refuses to run Kubeshark tap if the requested namespace selector resolves to > 50 pods (a guardrail against accidental cluster-wide taps).
- `hooks/post-tool-use.sh` — delegates entirely to `team-incident-response/hooks/post-tool-use.sh` (F3 signing path); this team adds zero net behaviour at PostToolUse.
- `hooks/subagent-stop.sh` — runs `kubeshark tap stop` and `linkerd viz tap stop` defensively when any agent in the package exits, so a stuck or crashed orchestrator can't leave taps running in the cluster.

The total hook surface is **3 files**, all delegating or terminating; no new signing logic, no new schema validation logic.

## 8. Pi-first authoring notes

Per the Pi context in the parent roadmap (and the F2/F3 specs), Pi has no built-in MCP. Every skill in this package targets Pi as the primary host and falls back to other hosts via per-host adapters.

### 8.1 Recipe / skill `Configuration — Pi (primary)` block

Each MCP recipe in `mcp-recipes/` (both this team's new recipes and the cross-linked F0 ones) carries a `Configuration — Pi (primary)` section that documents one of two paths:

**Path A — Vendor-shipped Pi extension (rare today, none in this team's set yet).** If a vendor publishes a Pi extension, the section says:

```
pi install npm:@vendor/network-tool-pi-extension
```

and references the extension's manifest.

**Path B — CLI-Anything wrap (default for this team).** Every CLI wrapper in this team uses the `HKUDS/CLI-Anything` pattern. The block reads:

```
# Generate a Pi-callable CLI skill from the upstream tool's source
git clone https://github.com/shaiknoorullah/opsbench-pi-skills
cd opsbench-pi-skills/<tool-name>-pi-skill
# Build (see CLI-Anything quickstart in cli-anything-framework.md)
pi install git:github.com/shaiknoorullah/opsbench-pi-skills/<tool-name>-pi-skill
```

Then the Pi `AGENTS.md` instruction block tells Pi to **always route the call through `opsbench-gateway`** (not direct to the wrapper) when the gateway is configured. The wrapper is a fallback for hosts without gateway plumbing.

### 8.2 Pi `AGENTS.md` snippet shipped with the team

`packages/team-network-operations/teams/AGENTS.md` (consumed by the Pi installer) includes:

```
# team-network-operations — Pi agent system prompt
You are operating in the team-network-operations scope. Network-plane forensics only.

Required behaviour:
- Always route MCP / CLI calls through OPSBENCH_GATEWAY_URL (defaults to http://localhost:8765).
- Do NOT directly exec Inspektor Gadget, Kubeshark, pwru, hubble, tetragon, istioctl, linkerd, or
  tcpdump binaries on the host; the gateway is the only sanctioned execution surface.
- Refuse any request that asks for a tap window > 600s, a pcap > the per-incident byte cap, or
  a namespace not in the current incident scope. The gateway will also Deny, but refuse politely
  before the gateway sees the request.
- Every artifact you write must land under $INCIDENT_DIR/ and will be SHA-256 + Ed25519 signed
  by the gateway / PostToolUse hook (F3 receipt chain).
- For DNS investigations, prefer the dns-probe-driver agent (correlates dig + Inspektor Gadget
  trace_dns) over raw nslookup. nslookup output is not receipt-verifiable on its own.
```

### 8.3 Pi `SYSTEM.md` overrides

Per-project `SYSTEM.md` snippets ship under `teams/network-operations/SYSTEM.md` with the incident-scope variables (`OPSBENCH_INCIDENT_ID`, `OPSBENCH_INCIDENT_NAMESPACES`, `OPSBENCH_GATEWAY_URL`, `OPSBENCH_KEY_FINGERPRINT`) and the per-incident overlay path.

### 8.4 Pi `models.json`

No model-specific guidance ships with this team — the package is model-agnostic. Reviewers running large eBPF investigations may prefer a long-context model for the `hubble-flow-collector` summarisation step; that's a per-user `models.json` choice, not a package decision.

### 8.5 Pi extension registration

The team's `package.json` declares it as an opsbench team-package that the Pi installer registers under `~/.pi/agent/teams/network-operations/`. The Pi marketplace listing (F5 work) will reference this team alongside the other F4 teams.

### 8.6 Other hosts (one-line pointers)

Per the parent roadmap, other hosts (Codex, Cursor, Gemini, OpenCode, GitHub Copilot, Claude Code) get a one-line pointer:

```
See tools/<host>-compat-layer/team-network-operations/README.md for the <host>-specific install
flow. The gateway URL and signed-receipt chain are identical across hosts; only the manifest
format differs.
```

Full adapter content ships in F5; this team's spec only commits to **per-host parity** for the canonical Pi-first install.

### 8.7 Cross-host receipt parity

Because every skill routes through `opsbench-gateway`, the F3 signed receipts are byte-identical across hosts. The verifier (`scripts/verify-receipts.sh` from F3) treats Pi-originated, Claude-Code-originated, and Codex-originated receipts the same way; the only `gateway_id` skew is the per-host instance ID, which is fine — verification is keyed on `signer_id`, not `gateway_id`.

## 9. Acceptance criteria

1. **Package layout.**
   - `packages/team-network-operations/` exists with `skills/`, `agents/`, `schemas/`, `policies/`, `mcp-recipes/`, `hooks/`, `teams/`, `README.md`, `package.json`.
   - The README lists supported hosts in priority order (Pi, Claude Code, Codex, Copilot, Cursor, Gemini, OpenCode) and links the parent roadmap.

2. **Skills land.**
   - 11 skill directories exist (one per § 2 row), each with `SKILL.md` validated by `npm run lint:md` and the existing skill-frontmatter validator.
   - Each skill's frontmatter declares `gateway.required: true` and references the right MCP recipe(s).
   - Each skill SKILL.md ships with a "Configuration — Pi (primary)" block and a "Also supports — Claude Code / Codex / …" subsection.

3. **Agents land.**
   - 10 agent files exist across `agents/team-1-orchestration/`, `agents/team-2-ebpf-forensics/`, `agents/team-3-mesh-introspection/`, `agents/team-4-dns-forensics/`, `agents/team-5-traffic-capture/`.
   - Each agent declares an explicit Cedar action allowlist matching § 3.
   - The orchestrator's prompt cross-references the `network-incident-summary.json` schema.

4. **Schemas land.**
   - 5 schemas in `schemas/` (per § 4), each draft-2020-12 valid (`ajv compile` exit 0).
   - `network-finding.schema.json` `$ref`s the F3 receipt schema correctly (CI fails if the cross-ref breaks).
   - At least one fixture per schema lives in `schemas/testdata/` and round-trips through ajv.

5. **MCP recipes.**
   - 10 new recipe files in `mcp-recipes/` (per § 5.2).
   - Each new recipe ships a `tools:` frontmatter block consumable by F1's `generate-cedar-policy.sh`.
   - The cross-link table in README.md points at the F0 home for the 7 curated recipes.
   - F1's generator runs in CI and produces `policies/tools-generated.cedar` without errors.

6. **Cedar policies.**
   - `policies/team-network-operations.cedar` exists with the rules sketched in § 6.1.
   - `policies/tools-generated.cedar` is gitignored (regenerated by F1's generator).
   - F1's `validate-cedar` CI job passes on both files.
   - At least one negative test ("forbid wins": `hubble config set` is denied even if a hand-written rule tries to allow it).

7. **Hooks.**
   - 3 hook files in `hooks/` (per § 7); each is a thin wrapper or terminator.
   - The pre-tool-use namespace-fence test passes (a synthetic call against an out-of-scope namespace is denied with a clear error).

8. **Gateway integration (F2 plumbing).**
   - Every recipe specifies `gateway.required: true`.
   - The package's `README.md` documents the gateway URL convention.
   - A smoke test against a local opsbench-gateway with the team's recipes loaded passes (routes calls through, denies out-of-scope namespaces, emits signed receipts).

9. **Signed receipts (F3 plumbing).**
   - Every skill run in the smoke test produces a v2 custody-log entry with a valid Ed25519 signature.
   - The `pcap-capture-and-seal` skill produces a `chain_of_receipts[]` with at least three signed receipts (start → stop → analyze) and the chain verifies offline via `scripts/verify-receipts.sh`.

10. **PR shape.**
    - Single PR titled `feat(team-network-operations): F4 team-network-operations package`, or up to 3 PRs if the reviewer prefers (schemas + skills + agents+recipes split).
    - All CI checks pass; markdownlint + cspell clean.
    - Each PR independently revertable.

11. **Documentation.**
    - `packages/team-network-operations/README.md` documents the package purpose, sub-team map, skill list, agent list, MCP recipe list, hooks, and per-host install.
    - `docs/integrations.md` gains a `team-network-operations` section pointing at the team README and the cross-linked recipes.
    - The parent roadmap's F4 § ordering item 3 references this spec.

12. **Pi-first parity.**
    - Each skill SKILL.md leads with the Pi block; "also supports" sections come after.
    - The `teams/AGENTS.md` Pi system prompt ships and is validated against the Pi linter (when F5's `pi-validate` CI job lands; until then, manual review).
    - `tools/pi-compat-layer/team-network-operations/` placeholder directory ships with a README pointer to F5.

## 10. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| eBPF tools require host privileges (`CAP_BPF`, `CAP_SYS_ADMIN`); a poorly-scoped Cedar allow could escalate from "read network" to "modify kernel state" | Medium | Critical | Every eBPF skill is wired to a vendor MCP / CLI wrapper that exposes only read-only gadget classes (`trace_*`, `top_*`); the Cedar `Forbid` list in § 6.1 explicitly denies mutating gadgets (`*_set`, `*_install`, `tracingpolicy create`). The gateway's per-upstream `capabilities` allowlist (F2) is the final gate. |
| Kubeshark / pcap captures leak PII or secrets | High | High | Default redaction profile is `redact_tls_handshake_only` (the F2 Cedar schema-derived gate; § 6.4). The CI receipts-validate workflow runs the `--grep-secrets` scan from F2 § 6 against the captures fixture. Operators who need raw pcap must opt in via an explicit per-incident overlay and accept the audit consequence (receipt records the unredacted decision). |
| Long-running tap or gadget left running by a crashed agent | Medium | Medium | `hooks/subagent-stop.sh` defensively tears down Kubeshark + Linkerd tap. The gateway also enforces a per-call window cap (Cedar; § 6.1). Worst case: the gateway emits a `decision: error, error_class: window-expired` receipt and the next gateway start sweeps orphans. |
| Vendor MCPs evolve (Inspektor Gadget, Kubeshark) and break the `tools:` frontmatter contract | Medium | Medium | F1's generator is the choke point — when a vendor MCP adds new tools, the recipe author adds them to the `tools:` block, the generator regenerates Cedar, CI validates. We do not vendor the MCPs; we pin a min version in the recipe and document the upgrade flow. |
| Borderline-stale upstreams (`0xKoda/WireMCP`, `krutsko/istio-mcp-server`) rot before this package ships | High | Medium | Both are pinned via opsbench-owned forks (shaiknoorullah/wiremcp-pin, shaiknoorullah/istio-mcp-pin). The README documents the fork policy and a quarterly review cadence. |
| Pi has no native MCP; CLI-Anything wrapper bundles fall behind upstream CLI flags | Medium | Medium | Each Pi wrapper bundles a `compatibility-matrix.md` listing the upstream CLI version it was generated against; CI runs a smoke test per quarter. The gateway's signed receipts include the `tool_version` so an analyst can detect mid-incident if a wrapper is behind. |
| Cross-package orchestration (`team-incident-response` ↔ `team-network-operations`) develops mutual edits that violate the "thin package" principle | Medium | Low | Cross-package coupling is **only** via two narrow contracts: the `network-incident-summary.json` produced by the orchestrator (read by `team-incident-response/evidence-cataloger`), and the `network-finding.schema.json` fields that `team-incident-response/forensic-synthesis` consumes. Both contracts are documented in this spec and locked by `additionalProperties: false`. |
| Per-incident overlay Cedar files accumulate and rot | Low | Low | Overlays live under `policies/incidents/` with a 90-day TTL enforced by `team-incident-response/skills/incident-quarantine` cleanup. The orchestrator's receipt chain references the overlay sha256 so post-hoc audits can resurrect a needed overlay from git history. |
| Operators run team-network-operations without F2 / F3 (because they only installed team-network-operations) | Low | High | The team's `README.md` and the orchestrator's startup refuse to run without `opsbench-gateway` reachable on `$OPSBENCH_GATEWAY_URL`. A startup probe runs `gateway: GET /healthz` and `gateway: GET /receipts/keyinfo`; if either fails, the team package refuses to operate. There is no "ungated" mode. |
| Service-mesh bifurcation (Istio Ambient vs. sidecar Istio vs. Cilium Service Mesh) leads to per-flavour code paths in `istio-config-snapshot` | Medium | Medium | The skill detects the mesh flavour via a discovery probe (querying `istiod` for sidecar mode vs. ztunnel) and dispatches to the correct subroutine. The discovery probe's output is part of the `mesh-snapshot.schema.json`, so the auditor sees what was detected. |
| DNS forensics false-positives (e.g. NXDOMAIN amplification flagged for a legitimate negative-cache scenario) | Medium | Low | `dns-incident-finding.schema.json#severity` defaults to `warn`, never `crit`, for first-cut detections. Promotion to `crit` requires a second corroborating finding (a `tetragon-flow-observer` or `hubble-flow-observer` finding for the same window). The `remediation_hint` field is explicitly advisory; the dns-policy-auditor never executes remediations. |
| Capture cap mis-configuration allows multi-GB pcap that fills the host disk | Low | High | The per-incident overlay carries `max_capture_bytes`; the gateway's Cedar evaluator (§ 6.1) refuses any capture > overlay cap; and `hooks/pre-tool-use.sh` does a fresh `df -kP $INCIDENT_DIR` check before letting the skill proceed. Three layers of defence. |
| The team's hooks unexpectedly interact with `team-incident-response`'s hooks (double-signing receipts, double-validating namespaces) | Medium | Medium | The team's hooks **delegate** to `team-incident-response/hooks/*.sh` for the signing path (no new signing logic added). The pre-tool-use checks specific to this team are limited to the two namespace + filesystem checks in § 7 and run *before* the delegated call. CI runs an integration test that asserts each receipt is signed exactly once. |
| F4 spec scope creep (reviewer asks to fold in mesh-mutation skills like canary rollout) | Medium | Low | The spec explicitly scopes to *forensics + introspection*. Mesh mutation (canary, traffic-shift, retry-budget edits) is `team-platform-engineering` territory. If a use case crosses the boundary, the orchestrator delegates to the other team via the cross-package adapter; this team's Cedar never grants mutation Allows. |

## 11. Open questions

1. **Sub-team sizing: 4 vs. 5 sub-teams.** This spec lands 5 sub-teams (orchestration, eBPF, mesh, DNS, capture). The reviewer may prefer 4 (fold DNS into eBPF, since DNS forensics relies on `trace_dns`). Default: keep 5; the DNS findings shape is distinct enough to warrant its own agents and schema. Cost of changing: shrink to 8 agents; merge `dns-incident-finding.schema.json` into `network-finding.schema.json` as a `kind` discriminator.

2. **WireMCP fork ownership.** The borderline-stale state of `0xKoda/WireMCP` argues for a fork. Should that fork live at `shaiknoorullah/wiremcp-pin` (this team owns it) or `opsbench-org/wiremcp` (a future opsbench-org GitHub org)? Default: `shaiknoorullah/wiremcp-pin` until F5 / F6 establishes the org.

3. **Microsoft Retina inclusion.** Retina is AKS-flavoured and the package's other tools are cloud-agnostic. Include it as a first-class recipe (current default) or relegate it to a "cloud-vendor-specific" appendix? The catalog flagged it as high-fit; default keeps it in.

4. **Pixie inclusion.** Pixie was flagged for "verify project health" in the catalog. We deliberately omitted it from the skill set (project-health uncertainty). Reviewer may want a placeholder skill `pixie-flow-collector` gated on a separate health check (e.g. "is the project still actively maintained as of <date>?"). Default: omit; add in a follow-up if Pixie passes a re-check.

5. **`network-incident-orchestrator` placement.** The orchestrator could live in `team-incident-response/agents/team-1-command/` (so all top-level orchestrators are co-located) or in `team-network-operations/agents/team-1-orchestration/` (per this spec, so the team is self-contained). Default: keep it here; cross-package orchestration uses the explicit Cedar permit in § 6.1.

6. **Should `pcap-capture-and-seal` write to S3 (via the F3 mirror) by default?** Default in this spec: no — pcaps stay on local disk under `$INCIDENT_DIR/captures/`. The F3 mirror is opt-in via the per-incident overlay. Reviewer may prefer the inverse: mirror on by default with object lock required (more secure-by-default but raises the install bar). Default keeps local-first because the install bar matters for first-time users.

7. **Cedar action namespace.** This spec proposes new actions under `network::*`, `inspektor-gadget::*`, `kubeshark::*`, `cilium::*`, `istioctl::*`, `linkerd::*`, `hubble::*`, `dns::*`, `coredns::*`. Reviewer may prefer all team-namespaced (`team-network-operations::ig::*`) to avoid colliding with future teams. Default: vendor-namespaced (matches the recipe naming) but documented as a convention, not a contract. If F4-team-platform-engineering also needs `istioctl::*` actions (for mesh mutations), they will live in the same namespace but with different `Allow`/`Forbid` sets per agent class.

8. **Tetragon read scope.** Tetragon ships events at high rate. The `tetragon-flow-observer` skill caps at N events or a time window — what is the right default N? Default in this spec: 10000 events or 60 s, whichever first. Reviewer's call.
