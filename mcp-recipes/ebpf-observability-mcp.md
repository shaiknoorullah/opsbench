# MCP Recipe — ebpf-observability-mcp (Cilium Hubble)

eBPF-based network and syscall observability via Cilium Hubble. Used when CNI-level
flow data is needed (DNS resolution, NetworkPolicy drops, L7 HTTP/gRPC visibility).

## Source

- Hubble: https://github.com/cilium/hubble
- MCP wrapper: COMMUNITY / TO BE BUILT (no upstream MCP exists)
- License: Apache-2.0 (Hubble itself)

## Status

PARTIAL — pnats uses Calico, not Cilium. eBPF observability is currently provided via:
- `tcpdump` on nodes (collector-nodes-network)
- Calico Felix logs
- NetworkPolicy event audit

If Cilium is later adopted (or a parallel Hubble deployment is added), this MCP becomes
relevant.

## Install (when adopted)

```bash
# Hubble CLI (already useful even without MCP)
HUBBLE_VERSION=$(curl -s https://raw.githubusercontent.com/cilium/hubble/master/stable.txt)
curl -L --remote-name-all https://github.com/cilium/hubble/releases/download/$HUBBLE_VERSION/hubble-linux-amd64.tar.gz
tar zxf hubble-linux-amd64.tar.gz -C /usr/local/bin

# Port-forward Hubble Relay
cilium hubble port-forward&
```

## Configuration (when MCP wrapper exists)

```jsonc
{
  "mcpServers": {
    "hubble": {
      "command": "hubble-mcp",
      "args": ["--read-only"],
      "env": {
        "HUBBLE_SERVER": "localhost:4245",
        "HUBBLE_NAMESPACE_FILTER": "pnats,pnats-data,kube-system"
      }
    }
  }
}
```

## Auth setup

- Hubble Relay TLS: mTLS via `hubble-server-certs` secret in `kube-system`.
- No per-user auth — pod-level access via the port-forward.

## Read-only verification

Hubble is read-only by design — it observes eBPF events. No mutation surface exists.

## Caveats

- **Build-this-MCP** — wrapper spec when needed:
  - Tools: `observe_flows`, `get_pod_flows`, `get_policy_drops`, `get_dns_resolutions`,
    `get_http_requests`, `get_service_dependencies`
  - All read-only by definition
- pnats currently runs Calico — would need to either switch CNI or run Hubble in
  parallel-observer mode (not standard).
- For NetworkPolicy debugging on Calico, use `calicoctl` via Bash + collector-nodes-network
  pulling Felix logs (no MCP yet).
