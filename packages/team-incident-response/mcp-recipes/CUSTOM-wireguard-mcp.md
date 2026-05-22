# CUSTOM MCP Spec — wireguard-mcp (build-this-mcp)

No upstream MCP exists for WireGuard. This MCP exposes mesh state and per-peer counters.

## Why this MCP is needed

The pnats cluster uses an 8-peer WireGuard mesh (10.50.0.0/24) for cross-DC connectivity:
2 OVH PVE + 4 Contabo + 1 on-prem PVE + 1 Azure witness. Network incidents (peer
unreachable, handshake failure, asymmetric routing) are common debugging targets.

`wg show` output is structured but pulling it consistently across 8 hosts via SSH is
tedious. A WireGuard MCP gives a single tool surface.

## Tool surface

### Read-only tools

| Tool                       | Purpose                                                |
|----------------------------|--------------------------------------------------------|
| `list_peers`               | All peers across the mesh with latest handshake, rx/tx |
| `get_peer`                 | Single peer detail incl. endpoint, allowed-ips         |
| `get_peer_handshake_age`   | Time since last successful handshake (per peer)        |
| `get_peer_traffic`         | rx_bytes/tx_bytes counters                             |
| `list_interfaces`          | wg0/wg1 interface configs per host                     |
| `get_routing_table`        | ip route show for the WG-managed routes                |
| `ping_peer`                | ICMP probe (10ms timeout, single packet, read-only)    |
| `check_mesh_connectivity`  | Matrix of all peer-to-peer reachability                |

### Mutation tools (Cedar-gated, recovery-executor only)

| Tool                       | Risk     | Purpose                                          |
|----------------------------|----------|--------------------------------------------------|
| `restart_peer_interface`   | medium   | wg-quick down/up — drops connections briefly     |
| `update_peer_endpoint`     | medium   | Change peer endpoint (e.g., public→private VLAN) |
| `rotate_preshared_key`     | high     | Coordinated PSK rotation                         |

NEVER include: `remove_peer`, `change_private_key` (these go through Ansible only).

## Implementation outline

```python
# wireguard_mcp/server.py
import subprocess
import paramiko
from mcp.server import Server

app = Server("wireguard-mcp")

PEERS = {
    "pve-01":      "148.113.49.6",
    "pve-02":      "148.113.47.246",
    "l.01":        "94.136.191.25",
    "s.01":        "94.136.185.77",
    "s.02":        "194.61.31.22",
    "s.03":        "194.61.31.239",
    "on-prem-pve": "172.17.0.23",  # via WG only
    "azure-witness": "<wg-mesh-only>"
}

def ssh_run(host: str, cmd: str) -> str:
    """SSH run via Arc for OVH/Contabo, direct for on-prem."""
    # Read-only validation: cmd must be in allowlist
    ALLOWED = ["wg show", "ip route show", "ping -c1 -W1"]
    if not any(cmd.startswith(p) for p in ALLOWED):
        raise PermissionError(f"Refused non-readonly cmd: {cmd}")
    # ... actual SSH invocation ...

@app.tool()
def list_peers() -> dict:
    """Read-only: aggregate wg show across all 8 mesh hosts."""
    return {h: ssh_run(h, "wg show wg0") for h in PEERS}

@app.tool()
def check_mesh_connectivity() -> dict:
    """Read-only: ping matrix N x N."""
    matrix = {}
    for a in PEERS:
        matrix[a] = {}
        for b in PEERS:
            if a == b: continue
            matrix[a][b] = ssh_run(a, f"ping -c1 -W1 10.50.0.{PEERS_IDX[b]}")
    return matrix
```

## Auth setup

- SSH keys: `~/.ssh/ovh_key` (OVH), `~/.ssh/contabo_key` (Contabo), `~/.ssh/onprem_key`.
- For Arc-managed hosts, use `az ssh arc` — see CLAUDE.md SSH Access section.
- Read-only enforcement is at MCP layer (command allowlist).

## Configuration

```jsonc
{
  "mcpServers": {
    "wireguard": {
      "command": "python",
      "args": ["-m", "wireguard_mcp.server", "--read-only"],
      "env": {
        "WG_MESH_CONFIG": "/home/devsupreme/work/ovh/ansible/inventory/wg-mesh.yml"
      }
    }
  }
}
```

## Caveats

- **WireGuard does not produce logs** — incidents are diagnosed via counters (handshake
  age, rx/tx delta) and probes. The MCP must collect these proactively before they're
  useful.
- **Cross-Contabo intra-VLAN endpoints** — peers within the same Contabo private VLAN
  use the VLAN IP (10.x), not the public IP. Endpoint selection is per-peer and
  documented in `ansible/inventory/host_vars/*.yml`.
- **s.04 reinstall pending** — current inventory has s.04 with `wg_endpoint_private`
  pointing to its eth1 VLAN IP that takes effect AFTER post-reinstall attach. Until
  reinstalled, the public endpoint is the only path. The MCP must read inventory
  live, not from a stale cache.
- **Azure witness has no public endpoint reachable from Contabo** — only OVH peers can
  hole-punch to it directly; Contabo peers route via the OVH mesh hubs.
