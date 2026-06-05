# MCP Recipe — talos-mcp

Wraps the Talos Linux machine API (apid gRPC) so the incident-response responder agent can
perform node-level forensics on a Talos-managed Kubernetes cluster — inspect kernel logs,
read etcd member status, dump machine config, and (when gated through the recovery-executor
agent class) reboot or reset a misbehaving node. Typical scenario: kubelet on one control-
plane node is unhealthy, the responder needs to confirm the node's machined/etcd state
without SSHing in (Talos has no shell), and may need to reboot the node after Cedar
approval.

## Source

- Repo: <https://github.com/Nosmoht/talos-mcp-server>
- License: MIT
- Maintainer: community (Nosmoht)

## Install

```bash
# Recommended: install via Go
go install github.com/Nosmoht/talos-mcp-server@latest

# Or run via Docker
docker pull ghcr.io/nosmoht/talos-mcp-server:latest
```

## Configuration — Pi (primary)

Pi has no built-in MCP client, so the Pi-native path is to wrap the upstream server's tool
surface as a CLI that Pi can shell out to via Bash. Use
[HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) to generate a Pi-callable CLI
from `talos-mcp-server`'s tool list, then publish the wrapper as a Pi skill. Because Talos
operations are inherently dangerous (a stray `reset` wipes a node), the CLI wrapper should
ship with `--dry-run` as the default and require an explicit `--confirm` flag for any
mutating subcommand.

```bash
# 1. Fork CLI-Anything and point it at talos-mcp-server's tool manifest, producing a CLI
#    named `talos-mcp` whose subcommands mirror the MCP tools (with --confirm gates).
# 2. Publish the wrapper to a git repo and install into Pi:
pi install git:github.com/<your-fork>/talos-mcp-pi-skill
```

Then add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```markdown
## Talos node access

When the user asks about a Talos node (etcd health, kernel logs, machine config, reboot),
call the `talos-mcp` CLI rather than `talosctl` directly so the Cedar audit trail captures
the call:

- `talos-mcp node-list` — list nodes known to the configured talosconfig
- `talos-mcp etcd-status --node <ip>` — etcd member health on a control-plane node
- `talos-mcp dmesg --node <ip>` — kernel ring buffer
- `talos-mcp machine-config --node <ip>` — read-only dump of machined config
- `talos-mcp reboot --node <ip> --confirm` — reboot (requires Cedar approval token)

Read `TALOSCONFIG` from the shell environment; never hardcode the path. For any
mutating subcommand, prompt the user for confirmation and pass `--cedar-token` from
the approval flow.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "talos": {
      "command": "talos-mcp-server",
      "args": ["--read-only", "--nodes", "10.0.0.10,10.0.0.11,10.0.0.12"],
      "env": {
        "TALOSCONFIG": "/home/devsupreme/.talos/config",
        "TALOS_ENDPOINTS": "10.0.0.10:50000,10.0.0.11:50000,10.0.0.12:50000"
      }
    }
  }
}
```

For mutating ops (recovery-executor only — gated by Cedar):

```jsonc
{
  "mcpServers": {
    "talos-write": {
      "command": "talos-mcp-server",
      "args": ["--allowed-ops", "reboot,shutdown,etcd-leave",
               "--require-confirmation",
               "--nodes", "10.0.0.10,10.0.0.11,10.0.0.12"],
      "env": {
        "TALOSCONFIG": "/home/devsupreme/.talos/config",
        "TALOS_CONFIRM": "true"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode each need a thin compat shim because their
MCP-equivalent surfaces handle stdio servers, env-var passthrough, and confirmation prompts
differently. Configs ship in F5 under `tools/<host>-compat-layer/` (one directory per host)
— each shim points at the same `talos-mcp-server` binary with the same `TALOSCONFIG` env.

## Auth setup

Talos auth is the talosconfig file, which embeds a client cert/key pair bound to a role
(typically `os:admin` or `os:reader`). For incident response:

1. Generate a read-only talosconfig that only grants `os:reader` to the responder agent:

   ```bash
   talosctl config new --roles os:reader --crt-ttl 720h /tmp/talos-readonly.yaml
   ```

2. Generate a separate `os:admin` talosconfig for the recovery-executor — never reuse the
   read-only file:

   ```bash
   talosctl config new --roles os:admin --crt-ttl 168h /tmp/talos-admin.yaml
   ```

3. Store both in your secret store (Azure Key Vault / 1Password) and export the path at
   shell init based on which agent class is running:

   ```bash
   export TALOSCONFIG=/home/devsupreme/.talos/config-readonly
   ```

4. For the recovery-executor session, the Cedar policy engine should swap to the admin
   talosconfig only after approval is granted — never leave `os:admin` mounted by default.

5. Verify connectivity before binding to Claude / Pi:

   ```bash
   talosctl --talosconfig "$TALOSCONFIG" version --nodes 10.0.0.10
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `node-list` | List nodes known to the talosconfig (endpoint, version, role) | read-only, no gate |
| `etcd-status` | Report etcd member health and leader on a control-plane node | read-only, no gate |
| `dmesg` | Read the kernel ring buffer for a node | read-only, redact at sink |
| `machine-config` | Dump the running machined config (sanitized) | read-only, redact secrets |
| `service-list` | List system services and their state (`apid`, `kubelet`, etc.) | read-only, no gate |
| `reboot` | Reboot a node | requires Cedar approval + on-call ack + `confirm=true` |
| `etcd-leave` | Remove a node from etcd membership | requires Cedar approval + second-human ack + `confirm=true` |

## Safety

- Read-only by default: when bound to an `os:reader` talosconfig, the server surfaces only
  the inspection tools. Mutating gRPC verbs fail at the apid layer (PermissionDenied) before
  any state change reaches the node.
- Cedar gating: `reboot`, `shutdown`, `reset`, `etcd-leave`, and any `upgrade` verb must
  require a policy that checks (a) on-call identity, (b) node IP allowlist, (c) explicit
  reason string, and (d) cluster-quorum precondition (refuse reboot if doing so would break
  etcd quorum).
- Mutation gating: every mutating tool is gated by `confirm=true`, but Cedar must still
  enforce blast-radius caps — never allow simultaneous reboot of more than one control-plane
  node, and never allow `reset` on a control-plane node without a second-human approval.
- Prompt-injection caveat: `dmesg` and `service-list` output is attacker-influenced (kernel
  log lines, journald output from containerized workloads). Treat all log content as
  untrusted — never let it auto-trigger further tool calls without a Cedar check.

## Caveats

- Talos has no shell — there is no `kubectl exec` equivalent path for forensics. If a node
  is so wedged that apid itself is unhealthy, this MCP cannot help; fall back to console /
  IPMI access. Plan for that out-of-band.
- Community-maintained, not a Sidero Labs official project. Track upstream for breaking
  changes in the talosctl API surface (Talos 1.6 → 1.7 shifted several gRPC method names).
- License is MIT — safe to vendor or fork for the Pi wrapper.
- Infra prereqs: the host running the MCP must have network reachability to apid (TCP 50000)
  on every node in `--nodes`. For the OVH cluster, that means either running the MCP inside
  the cluster as a sidecar OR routing through the existing SSH tunnel
  (`ovh-kubeconfig.service` plus a separate apid tunnel).
- `etcd-leave` is irreversible — once a member is removed, the only path back is a fresh
  `talosctl reset` + rejoin. Cedar policy must require an explicit reason string and a
  second human approval for this op.

## See also

- `k8s-mcp.md` — for kubelet / pod-level inspection once the node itself is confirmed up
- `CUSTOM-longhorn-mcp.md` — to drain Longhorn replicas off a node before reboot
- `grafana-mcp.md` — to correlate node-level events with Loki/Tempo traces
