# MCP Recipe — inspektor-gadget-mcp

eBPF-powered kernel forensics for Kubernetes. Called by the `forensics-collector`,
`triage-analyst`, and `recovery-planner` opsbench agent classes when an incident
requires below-the-kubelet evidence — DNS resolution chains, TCP connection life-cycle,
syscall traces, file-open events, exec audit, or capability checks — without rolling
out a node-level agent or restarting workloads. Inspektor Gadget runs as a DaemonSet
and exposes per-gadget MCP tools backed by safe, signed eBPF programs.

## Source

- Repo: <https://github.com/inspektor-gadget/ig-mcp-server>
- License: Apache-2.0
- Maintainer: Inspektor Gadget org (CNCF orbit; project incubated alongside Kinvolk/Microsoft contributions)

## Install

```bash
# Install the Inspektor Gadget CLI (kubectl plugin)
IG_VERSION=$(curl -s https://api.github.com/repos/inspektor-gadget/inspektor-gadget/releases/latest | jq -r .tag_name)
curl -L -o /tmp/kubectl-gadget.tar.gz \
  https://github.com/inspektor-gadget/inspektor-gadget/releases/download/${IG_VERSION}/kubectl-gadget-linux-amd64-${IG_VERSION}.tar.gz
tar -C /usr/local/bin -xzf /tmp/kubectl-gadget.tar.gz kubectl-gadget

# Deploy the in-cluster DaemonSet
kubectl gadget deploy

# Pull the MCP server image
docker pull ghcr.io/inspektor-gadget/ig-mcp-server:latest
```

## Configuration — Pi (primary)

Pi has no built-in MCP runtime, so the `ig-mcp-server` surface is exposed to Pi via
the CLI-Anything wrap path. The wrapper translates each gadget MCP tool into a
discrete CLI subcommand the Pi agent invokes via Bash, with `KUBECONFIG` and the
target node/namespace passed as flags.

```bash
# Install the CLI-Anything-generated Pi skill
pi install git:github.com/<your-fork>/inspektor-gadget-pi-skill
```

Then add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```markdown
## inspektor-gadget kernel forensics

When the user reports a symptom that needs below-userspace evidence — intermittent
DNS failure, mystery TCP RST, suspect exec inside a pod, unexpected file open —
call the `ig-pi` wrapper instead of `kubectl exec` or node SSH:

- `ig-pi trace-dns --namespace <ns> --pod <pod> --duration 30s` — capture DNS queries/responses
- `ig-pi trace-tcp --namespace <ns> --pod <pod> --duration 30s` — connection life-cycle
- `ig-pi trace-exec --namespace <ns> --duration 30s` — process executions (audit)
- `ig-pi trace-open --namespace <ns> --pod <pod> --duration 30s` — file opens
- `ig-pi snapshot-process --namespace <ns>` — point-in-time process list

Always set `--duration` to a bounded window (≤60s) and pin `--namespace`. Treat
captured output as evidence to be archived in the incident bundle; do not paste raw
syscall buffers into chat. eBPF programs are read-only — they cannot mutate the
kernel — but they do consume CPU/memory on the target node, so avoid concurrent
gadgets on the same node during a P1.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "inspektor-gadget": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/home/devsupreme/.kube:/root/.kube:ro",
        "-e", "KUBECONFIG=/root/.kube/config",
        "ghcr.io/inspektor-gadget/ig-mcp-server:latest",
        "--read-only"
      ],
      "env": {
        "IG_NAMESPACE_FILTER": "pnats,pnats-data,kube-system",
        "IG_MAX_DURATION": "60s"
      }
    }
  }
}
```

For non-Docker hosts, run the binary directly: `ig-mcp-server --kubeconfig
$KUBECONFIG --read-only`. The server proxies to the in-cluster `gadget` DaemonSet
via the Kubernetes API — no direct node access is required from the MCP host.

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode all consume `ig-mcp-server` either via
native MCP (where supported) or via the CLI-Anything wrapper used for Pi. Per-host
config snippets ship in `tools/<host>-compat-layer/` in F5.

## Auth setup

1. Confirm `KUBECONFIG` points to the intended cluster and the user has
   `gadget.kinvolk.io` API group access: `kubectl auth can-i list traces.gadget.kinvolk.io`.
2. Deploy the DaemonSet (one-time per cluster): `kubectl gadget deploy` —
   creates the `gadget` namespace and a privileged DaemonSet (required for eBPF
   program loading).
3. Verify the DaemonSet is healthy on every node: `kubectl get pods -n gadget -o wide`.
4. Smoke-test a read-only gadget: `kubectl gadget trace dns --namespace kube-system
   --timeout 5s` — expect at least one DNS query event from CoreDNS or kubelet.
5. Verify the MCP server starts and lists gadgets: `docker run --rm
   ghcr.io/inspektor-gadget/ig-mcp-server:latest --list-tools` — expect entries for
   `trace_dns`, `trace_tcp`, `trace_exec`, `trace_open`, `snapshot_process`.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `trace_dns` | Capture DNS queries/responses per pod (resolves NXDOMAIN, slow upstream) | `action == "ig:trace_dns"` — allow read; pin `resource.namespace`; cap `duration ≤ 60s` |
| `trace_tcp` | TCP connect/accept/close events with latency and RST cause | `action == "ig:trace_tcp"` — allow read; pin `resource.namespace`; cap `duration ≤ 60s` |
| `trace_exec` | Audit process executions inside pods (binary path, args, uid) | `action == "ig:trace_exec"` — allow only for `principal.role == "forensics-collector"`; pin namespace |
| `trace_open` | File-open syscalls with path and flags (config probing, secret leak) | `action == "ig:trace_open"` — allow read; pin namespace; deny path globs into `/etc/shadow`-class targets |
| `trace_capabilities` | Capability checks performed by kernel for a pod | `action == "ig:trace_capabilities"` — allow read; pin namespace |
| `snapshot_process` | Point-in-time process tree per node/namespace | `action == "ig:snapshot_process"` — allow read; pin namespace |
| `top_file` / `top_tcp` | Top-N file or TCP traffic by pod (hot-spot finder) | `action == "ig:top_*"` — allow read; cap `interval ≤ 30s` |

## Safety

- Read-only by definition: all gadgets are eBPF observers; the kernel verifier
  rejects programs that mutate state. No write surface exists.
- Cedar gating SHOULD pin `resource.namespace` and cap `duration` to ≤60s per call
  to prevent runaway traces from saturating node CPU.
- The `gadget` DaemonSet runs privileged (required for eBPF program loading via
  `bpf()` syscall) — treat the namespace as a high-trust boundary; RBAC on
  `traces.gadget.kinvolk.io` is the only practical gate.
- Prompt-injection caveat: `trace_exec` and `trace_open` capture argv and file
  paths controlled by workloads. A hostile pod could spawn processes with
  adversarial argv (e.g., `/bin/sh -c '<prompt-injection>'`) hoping a triage agent
  pastes the trace into an LLM. Sanitize / quote captured strings before
  re-injection into any LLM context.
- Mutation gating: N/A (no mutation tools); however, `kubectl gadget deploy` is a
  cluster-level mutation and MUST be gated behind a separate Cedar policy at
  install time — never expose `deploy` through the MCP surface.
- Node resource impact: each active gadget consumes CPU and a small ring buffer;
  concurrent gadgets on the same node during a P1 can amplify latency. Enforce
  a per-node concurrency cap in the wrapper.

## Caveats

- Requires Linux kernel ≥5.4 with BTF (BPF Type Format) enabled on every node.
  Older nodes (kernel <5.4, or CO-RE-incompatible kernels like RHEL 7) will be
  skipped by the DaemonSet — partial cluster coverage.
- `ig-mcp-server` is in active development (beta-tier); tool schemas may change
  between minor releases. Pin the image tag in production configs.
- Apache-2.0 license permits vendoring; the wrapper repo should track upstream
  releases via dependabot to pick up CVE patches in the eBPF programs.
- DaemonSet pod is privileged — required for `bpf()` syscall — which makes it a
  high-value target. Restrict who can `exec` into the `gadget` namespace.
- Some managed Kubernetes distributions (GKE Autopilot, certain EKS Fargate
  profiles) disallow privileged DaemonSets — inspektor-gadget cannot be deployed
  there. Verify cluster compatibility before promising kernel forensics in
  per-cluster runbooks.
- High-volume gadgets (`trace_open` on a busy node) can drop events when the
  perf ring buffer fills; treat captures as best-effort, not audit-complete.

## See also

- `ebpf-observability-mcp.md` — Cilium Hubble for CNI-level flow visibility; pair
  with inspektor-gadget for full-stack network forensics.
- `k8s-mcp.md` — raw kubectl surface; use to correlate inspektor-gadget findings
  with pod/event state.
- `velociraptor-mcp.md` — host-level forensics when the issue lives below the
  kubelet on the underlying node.
