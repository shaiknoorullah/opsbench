# CUSTOM MCP Spec — longhorn-mcp (build-this-mcp)

No upstream MCP exists for Longhorn. This file specifies what the custom MCP must provide.

## Why this MCP is needed

Longhorn is the primary storage backend (longhorn-cnt SC on Contabo, longhorn on OVH).
Storage incidents (FailedRebuilding, replica EIO, journal abort) are routine and require
deep Longhorn-CRD inspection that is awkward via raw kubectl:

- Volume/Engine/Replica state correlation across pods
- Backup/snapshot status lookup
- Replica salvage decisions (which replica to keep, which to delete)
- Disk-level free-space inspection per node

Using raw kubectl exposes a wide blast radius (you CAN patch Longhorn CRDs directly, and
that causes split-brain). A dedicated MCP forces a narrow, read-by-default surface.

## Tool surface

### Read-only tools

| Tool                          | Purpose                                                |
|-------------------------------|--------------------------------------------------------|
| `list_volumes`                | All Longhorn volumes with state, replica count         |
| `get_volume`                  | Single volume detail incl. replicas, engine, snapshots |
| `list_replicas`               | Replicas of a volume, with node, disk, state           |
| `get_replica_io_errors`       | Per-replica I/O error counter (engine-level)           |
| `list_backups`                | Backup list with target, size, age                     |
| `get_backup_status`           | Specific backup's restore-readiness                    |
| `list_engine_images`          | Available engine images                                |
| `list_disks`                  | Per-node disk: total/used/free/allowScheduling         |
| `get_node_health`             | Longhorn node readiness, instance-manager pods         |
| `get_recurring_jobs`          | Snapshot/backup recurring job config                   |
| `get_settings`                | Cluster-wide Longhorn settings                         |
| `get_logs`                    | Targeted instance-manager / engine logs for a window   |

### Mutation tools (Cedar-gated, recovery-executor only, requires human_approval)

| Tool                          | Risk        | Purpose                                       |
|-------------------------------|-------------|-----------------------------------------------|
| `salvage_volume`              | medium      | Set salvage flag on a volume                  |
| `delete_replica`              | destructive | Remove a stale/failed replica                 |
| `detach_volume`               | medium      | Detach to allow re-attach to a different node |
| `reattach_volume`             | medium      | Reattach to a chosen node                     |
| `update_volume_replica_count` | medium      | Scale replicas up/down                        |
| `restore_from_backup`         | high        | Restore a backup into a new PVC               |

NEVER include: `delete_volume`, `purge_replica_with_data`, `force_detach` (these belong
strictly behind manual kubectl gated by Cedar's destructive-action policy).

## Implementation outline

```python
# longhorn_mcp/server.py
from mcp.server import Server
from kubernetes import client, config

app = Server("longhorn-mcp")

@app.tool()
def list_volumes(namespace: str = "longhorn-system") -> list:
    """Read-only: list all Longhorn volumes."""
    api = client.CustomObjectsApi()
    return api.list_namespaced_custom_object(
        group="longhorn.io", version="v1beta2",
        namespace=namespace, plural="volumes"
    )["items"]

@app.tool()
def get_replica_io_errors(volume: str, namespace: str = "longhorn-system") -> dict:
    """Read-only: aggregate I/O error counters per replica."""
    # Query engine status + replica CRDs + recent instance-manager logs
    ...

@app.tool(requires_confirmation=True)
def salvage_volume(volume: str, namespace: str = "longhorn-system") -> dict:
    """Gated mutation: set salvageRequested=true on volume."""
    ...
```

Transport: stdio (default for Claude Code).
Auth: in-cluster service account `longhorn-mcp` with a narrow ClusterRole:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: longhorn-mcp-readonly
rules:
- apiGroups: ["longhorn.io"]
  resources: ["volumes", "replicas", "engines", "backups", "snapshots",
              "nodes", "disks", "settings", "recurringjobs", "engineimages"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods", "events"]
  verbs: ["get", "list"]
  resourceNames: []  # restricted via namespace selector at runtime
- apiGroups: [""]
  resources: ["pods/log"]
  verbs: ["get"]
```

A separate `longhorn-mcp-writer` Role is bound only for the `recovery-executor` agent
and only for the gated mutation tools above.

## Configuration

```jsonc
{
  "mcpServers": {
    "longhorn": {
      "command": "python",
      "args": ["-m", "longhorn_mcp.server", "--read-only"],
      "env": {
        "KUBECONFIG": "/home/devsupreme/.kube/config",
        "K8S_CONTEXT": "ovh"
      }
    }
  }
}
```

## Caveats

- Longhorn 1.5+ vs 1.6+ — CRD versions differ (v1beta2 vs v1beta3). Pin in the server.
- Some operations (e.g., disk re-scan) require pod exec into longhorn-manager — that
  bypasses MCP scoping. Use raw kubectl + Cedar for those.
- `instance-manager` pods have one-of-many naming — log retrieval must enumerate, not
  guess.
- INC-2026-05-21-001 (chi-audit Longhorn EIO) is the reference incident — every tool in
  this MCP should be testable against that incident's evidence dir.
