# CUSTOM MCP Spec — contabo-mcp (build-this-mcp)

No upstream MCP exists for Contabo. The `cntb` CLI exists (see `contabo-cntb` skill) and
is well-documented, but agents call it via Bash with non-trivial JSON parsing. A wrapper
MCP gives structured access and read-only-default safety.

## Why this MCP is needed

Half the cluster's worker nodes are Contabo VPSes (`n.cnt.ap-south-1a.l.01/s.01/s.02/s.03`).
Contabo-specific operations include:

- Per-instance reinstall (DESTRUCTIVE — wipes disk; required to attach private network)
- Private-network attach/detach (requires reinstall on Contabo — known gotcha)
- Snapshot management before reinstall / OS upgrade
- Public IP allocation/release
- Custom image management (for hardened OS rollout)
- S3 object storage (currently used for Loki chunks, MinIO backups)
- Firewall rules at the Contabo edge (in addition to host-level)

## Tool surface

### Read-only tools

| Tool                       | Purpose                                                |
|----------------------------|--------------------------------------------------------|
| `list_instances`           | All VPSes with status, region, IPs                     |
| `get_instance`             | Instance detail                                        |
| `list_private_networks`    | Private networks with attached instances               |
| `list_snapshots`           | Snapshots per instance                                 |
| `list_images`              | Custom images                                          |
| `list_s3_buckets`          | Object storage buckets                                 |
| `list_firewalls`           | Edge firewall rules                                    |
| `get_audit_log`            | Recent API calls (incident correlation)                |

### Mutation tools (Cedar-gated, requires human_approval, destructive flagged)

| Tool                            | Risk        | Notes                                       |
|---------------------------------|-------------|---------------------------------------------|
| `create_snapshot`               | low         | Always recommended before risky ops         |
| `restart_instance`              | medium      | Soft reboot                                 |
| `rescue_mode`                   | medium      | Boot into rescue OS                         |
| `attach_private_network`        | destructive | REINSTALL REQUIRED — disk wipe              |
| `detach_private_network`        | destructive | REINSTALL REQUIRED — disk wipe              |
| `reinstall_instance`            | destructive | DISK WIPE; never without snapshot           |
| `delete_snapshot`               | medium      | Verify retention before deletion            |

NEVER include: `delete_instance` (irreversible; manual cntb only with extra confirmation).

## Implementation outline

```python
# contabo_mcp/server.py
import subprocess
import json
from mcp.server import Server

app = Server("contabo-mcp")

def cntb(args: list[str]) -> dict:
    """Wrap cntb CLI with JSON output."""
    out = subprocess.check_output(["cntb", *args, "--output", "json"])
    return json.loads(out)

@app.tool()
def list_instances() -> list:
    """Read-only: list all Contabo VPS instances."""
    return cntb(["get", "instances"])

@app.tool(requires_confirmation=True, risk="destructive")
def reinstall_instance(instance_id: int, image_id: str, ssh_keys: list[str]) -> dict:
    """DESTRUCTIVE: reinstalls OS, WIPES DISK. Snapshot must exist first."""
    snapshots = cntb(["get", "snapshots", "--instanceId", str(instance_id)])
    if not snapshots:
        raise RuntimeError("Refusing: no snapshot exists for this instance.")
    return cntb(["reinstall", "instance", str(instance_id),
                 "--imageId", image_id,
                 "--sshKeys", ",".join(ssh_keys)])
```

## Auth setup

- Contabo OAuth2 credentials in `~/.cntb.yaml` (client_id, client_secret, tenant_id).
- Or env vars: `CNTB_CLIENT_ID`, `CNTB_CLIENT_SECRET`, `CNTB_USER`, `CNTB_PASSWORD`.
- Read-only is enforced at MCP layer (Contabo API has no native read-only role).

## Configuration

```jsonc
{
  "mcpServers": {
    "contabo": {
      "command": "python",
      "args": ["-m", "contabo_mcp.server", "--read-only"],
      "env": {
        "CNTB_CLIENT_ID":     "${CNTB_CLIENT_ID}",
        "CNTB_CLIENT_SECRET": "${CNTB_CLIENT_SECRET}",
        "CNTB_USER":          "${CNTB_USER}",
        "CNTB_PASSWORD":      "${CNTB_PASSWORD}"
      }
    }
  }
}
```

## Caveats

- **Contabo reinstall destroys the disk** — must verify snapshot exists AND backups are
  current BEFORE allowing this mutation. The MCP should refuse on missing snapshot.
- **Private-network attach requires reinstall** — this is a Contabo platform gotcha,
  not an MCP design choice. Document prominently in tool docstring.
- **Region "IND" = Mumbai** — coordinate-string handling in tool args.
- Public IPs in ranges 94.136.x, 194.61.x, 217.216.x → Contabo. Useful for incident
  scope inference.
- `s.01` and `l.01` are SAFE-OVERLAY only (live workloads, reinstall deferred — see
  CLAUDE.md). The MCP should refuse `reinstall_instance` on these IDs without an
  explicit `--force-i-acknowledge-live-workload` flag that also writes to timeline.md.
