# MCP Recipe — kubeshark-mcp

eBPF-powered API traffic analyzer for Kubernetes — surfaced to the
`triage-analyst`, `network-forensics`, and `recovery-planner` opsbench agent
classes during incident response when L7 protocol visibility (HTTP, gRPC, DNS,
Kafka, AMQP, Redis) is required beyond what raw `kubectl logs` or NetworkPolicy
audits can provide. Use when latency or error spikes in a service mesh need
packet-level confirmation, or when a hostile workload is suspected of
exfiltrating data over an unexpected protocol. TTL-bounded captures only — the
hub footprint is heavy and not suitable for steady-state observability.

## Source

- Repo: <https://github.com/kubeshark/kubeshark>
- License: Apache-2.0
- Maintainer: Kubeshark (kubeshark.co)

## Install

```bash
# Vendor-recommended Helm install with MCP server enabled
helm repo add kubeshark https://helm.kubeshark.co
helm repo update
helm install kubeshark kubeshark/kubeshark \
  --namespace kubeshark --create-namespace \
  --set mcpServer.enabled=true \
  --set tap.docker.registry=docker.io/kubeshark \
  --set tap.proxy.host=0.0.0.0

# Confirm hub + workers came up
kubectl -n kubeshark get pods
```

## Configuration — Pi (primary)

Pi has no built-in MCP runtime, so the kubeshark MCP surface is exposed to Pi
via the CLI-Anything wrap path. The wrapper translates each MCP tool into a
discrete CLI subcommand the Pi agent invokes via Bash; under the hood the
wrapper port-forwards to the Kubeshark hub and calls its MCP endpoint.

```bash
# Install the CLI-Anything-generated Pi skill
pi install git:github.com/<your-fork>/kubeshark-pi-skill
```

Then add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```markdown
## kubeshark L7 capture

When the user reports an L7-layer symptom (5xx spikes, slow gRPC, unexpected
egress, mTLS handshake failures), call the `kubeshark-pi` wrapper rather than
shelling raw tcpdump:

- `kubeshark-pi tap --namespace <ns> --ttl 120s` — bounded capture window
- `kubeshark-pi query --filter 'http.status >= 500' --limit 200` — KFL filter
- `kubeshark-pi pcap --since 2m --output /tmp/<incident-id>.pcap` — export

ALWAYS pass `--ttl` (max 300s in production). Never run `tap` without
`--namespace` on shared clusters. The hub footprint is heavy; tear down with
`kubeshark-pi stop` once the capture window closes. Treat captured payloads as
sensitive — they may contain auth headers, tokens, and PII.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "kubeshark": {
      "command": "kubeshark",
      "args": ["mcp", "--read-only", "--ttl", "300s"],
      "env": {
        "KUBECONFIG": "/home/devsupreme/.kube/config",
        "KUBESHARK_NAMESPACE": "kubeshark",
        "KUBESHARK_HUB_URL": "http://localhost:8898"
      }
    }
  }
}
```

For air-gapped clusters, set `KUBESHARK_HUB_URL` to the in-cluster service
DNS and run the MCP host inside a debug pod with the kubeshark client mounted.

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode all consume kubeshark via the
same CLI-Anything wrapper used for Pi (or via the native MCP server for hosts
that support it). Per-host config snippets ship in `tools/<host>-compat-layer/`
in F5.

## Auth setup

1. Confirm `KUBECONFIG` points at the target cluster:
   `kubectl config current-context`.
2. Verify the Kubeshark hub is reachable in-cluster:
   `kubectl -n kubeshark get svc kubeshark-hub`.
3. Port-forward the hub locally for the MCP client:
   `kubeshark proxy &` (binds `http://localhost:8898`).
4. Confirm the MCP server is listening:
   `curl -s http://localhost:8898/mcp/health` — expect `{"status":"ok"}`.
5. Smoke-test a bounded read: `kubeshark mcp --read-only --ttl 60s` then
   issue `tools/list` via the MCP host — expect `tap_start`, `query`,
   `pcap_export`, `tap_stop`, and `worker_status`.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `tap_start` | Begin a bounded L7 capture in a namespace | `action == "kubeshark:tap_start"` — require `resource.ttl <= 300s` AND `resource.namespace` pinned |
| `query` | Run a KFL query against captured traffic | `action == "kubeshark:query"` — allow read for `triage-analyst`; deny payload body fields unless `network-forensics` |
| `pcap_export` | Export a PCAP slice for offline analysis | `action == "kubeshark:pcap_export"` — require `principal.role == "network-forensics"` AND audit log entry |
| `tap_stop` | Tear down active workers | `action == "kubeshark:tap_stop"` — allow for any incident-response agent |
| `worker_status` | Per-node worker health and capture rate | `action == "kubeshark:worker_status"` — allow read |
| `protocol_stats` | Aggregate counts by protocol/status | `action == "kubeshark:protocol_stats"` — allow read |
| `service_map` | L7 dependency graph derived from captured flows | `action == "kubeshark:service_map"` — allow read; pin namespace |

## Safety

- Read-only defaults: `--read-only` disables `pcap_export` and any mutation
  surface; the MCP host MUST enforce this for triage-analyst callers.
- Cedar gating MUST pin `resource.namespace` and cap `resource.ttl` — an
  unbounded tap quickly saturates worker memory and node disk.
- `pcap_export` is the sensitive verb: PCAPs contain raw payloads including
  Authorization headers, JWTs, and PII. Gate to `network-forensics` only and
  log every export to the audit trail with case ID.
- Prompt-injection caveat: captured HTTP bodies, headers, and gRPC payloads
  are fed back to the LLM via `query` results. A hostile workload can plant
  adversarial instructions in response bodies. Treat all captured strings as
  untrusted; never auto-execute remediation derived from packet content.
- Workers run as privileged DaemonSets with eBPF capabilities — the install
  itself is a trust boundary. Pin chart version and verify image digests.

## Caveats

- Heavy footprint: workers are privileged eBPF pods; default CPU/memory
  requests are non-trivial. Not suitable for always-on observability — run
  on-demand with TTL.
- The `mcp` subcommand is recent (Kubeshark v52+); tool schema may shift
  between minor releases. Pin the chart and CLI to matching versions.
- Apache-2.0 license permits vendoring, but Kubeshark Pro features (longer
  retention, SSO) are proprietary — keep the OSS surface only for opsbench.
- Requires Linux nodes with kernel >= 4.18 for full eBPF support; older
  kernels fall back to libpcap mode with degraded protocol coverage.
- Encrypted traffic (TLS without mTLS keylog) is captured but not decrypted;
  for in-mesh visibility deploy alongside a service mesh that exposes
  cleartext to the sidecar (Istio with `permissive` mTLS, Linkerd).
- KUBECONFIG context switches MUST be explicit between captures — a stale
  context can start a tap in the wrong cluster.

## See also

- `k8s-mcp.md` — kubectl surface for correlating captured flows with pod state.
- `ebpf-observability-mcp.md` — Cilium Hubble alternative for CNI-level flows.
- `grafana-mcp.md` — metrics correlation around the capture window.
