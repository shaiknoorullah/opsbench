# MCP Recipe — k8s-mcp

Kubernetes MCP server with kubectl-equivalent read tools and gated write tools.

## Source

- Repo: <https://github.com/alexei-led/k8s-mcp-server>
- License: Apache-2.0
- Maintainer: alexei-led (community)

## Install

```bash
go install github.com/alexei-led/k8s-mcp-server@latest
# OR via Docker
docker pull ghcr.io/alexei-led/k8s-mcp-server:latest
```

## Configuration

```jsonc
{
  "mcpServers": {
    "k8s": {
      "command": "k8s-mcp-server",
      "args": ["--read-only", "--allowed-namespaces", "pnats,pnats-data,longhorn-system,observability,argocd"],
      "env": {
        "KUBECONFIG": "/home/devsupreme/.kube/config",
        "K8S_CONTEXT": "ovh"
      }
    }
  }
}
```

For write access (recovery-executor only — gated by Cedar):

```jsonc
{
  "mcpServers": {
    "k8s-write": {
      "command": "k8s-mcp-server",
      "args": ["--allowed-verbs", "get,list,describe,logs,scale,patch,apply",
               "--allowed-namespaces", "pnats,pnats-data",
               "--require-confirmation"],
      "env": { "KUBECONFIG": "/home/devsupreme/.kube/config", "K8S_CONTEXT": "ovh" }
    }
  }
}
```

## Auth setup

Uses your existing kubeconfig. For incident response specifically:

1. Verify context: `kubectl config current-context` should match `K8S_CONTEXT`.
2. The systemd SSH tunnel (`ovh-kubeconfig.service`) must be running:
   `systemctl --user status ovh-kubeconfig.service`.
3. Service-account approach for unattended runs:

   ```bash
   kubectl create sa incident-response -n kube-system
   kubectl create clusterrolebinding incident-response \
     --clusterrole=view --serviceaccount=kube-system:incident-response
   # then bind the token into KUBECONFIG
   ```

## Read-only verification

`--read-only` blocks: create, patch, apply, replace, scale, delete, exec, port-forward,
cp. Exec is blocked even in read-only mode to prevent side-channel mutation.

## Caveats

- This server respects `--allowed-namespaces` BUT individual tools may bypass via
  `--all-namespaces` flag — always pin the namespace in queries.
- `kubectl exec` is never read-only — exec into a pod can mutate state. Use logs instead.
- For Longhorn CRDs (volumes, replicas, engines), this server can read but should NOT
  patch — Longhorn has its own CRD controller and direct patches cause split-brain.
  Use the dedicated longhorn-mcp (see CUSTOM-longhorn-mcp.md) for storage mutations.
- Two clusters on this laptop (`ovh` and on-prem) — always confirm context BEFORE any
  mutating MCP call. The session-start hook reports current context.
