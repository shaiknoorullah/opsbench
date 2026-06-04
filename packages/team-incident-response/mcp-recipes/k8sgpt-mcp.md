# MCP Recipe — k8sgpt-mcp

LLM-assisted Kubernetes triage. Called by the `triage-analyst` and `recovery-planner`
opsbench agent classes during incident response when raw `kubectl` output is too
verbose to reason over. K8sGPT analyzes cluster state (failing pods, crash-looping
deployments, broken services, ingress misconfigs) and returns structured findings
with suggested remediations — useful as a first-pass scanner before deeper agent
investigation.

## Source

- Repo: <https://github.com/k8sgpt-ai/k8sgpt>
- License: Apache-2.0
- Maintainer: k8sgpt-ai org (CNCF Sandbox)

## Install

```bash
# Homebrew / Linuxbrew
brew install k8sgpt

# Or release binary
curl -L -o /usr/local/bin/k8sgpt \
  https://github.com/k8sgpt-ai/k8sgpt/releases/latest/download/k8sgpt_linux_amd64
chmod +x /usr/local/bin/k8sgpt

# Or container
docker pull ghcr.io/k8sgpt-ai/k8sgpt:latest
```

## Configuration — Pi (primary)

Pi has no built-in MCP runtime, so the k8sgpt MCP surface is exposed to Pi via the
CLI-Anything wrap path. The wrapper translates each MCP tool into a discrete CLI
subcommand the Pi agent invokes via Bash.

```bash
# Install the CLI-Anything-generated Pi skill
pi install git:github.com/<your-fork>/k8sgpt-pi-skill
```

Then add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```markdown
## k8sgpt triage

When the user reports a cluster symptom (CrashLoopBackOff, ImagePullBackOff, pending
pod, failing service), call the `k8sgpt-pi` wrapper before issuing raw `kubectl`:

- `k8sgpt-pi analyze --namespace <ns> --anonymize` — full-cluster or namespace scan
- `k8sgpt-pi analyze-pods --namespace <ns>` — pod-only filter
- `k8sgpt-pi explain --filter <Pod|Deployment|Service> --anonymize` — LLM rationale

Always pass `--anonymize` so pod names, namespaces, and image references are hashed
before being sent to the LLM backend. Never call without `--namespace` on production
contexts (ovh, on-prem). Use the explain output as a hypothesis, not a fix — verify
with `kubectl describe` before any mutation.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "k8sgpt": {
      "command": "k8sgpt",
      "args": ["serve", "--mcp", "--anonymize"],
      "env": {
        "KUBECONFIG": "/home/devsupreme/.kube/config",
        "K8SGPT_BACKEND": "openai"
      }
    }
  }
}
```

For air-gapped or self-hosted LLM backends, swap `K8SGPT_BACKEND` to `localai`,
`ollama`, or `azureopenai` and pin the endpoint via `k8sgpt auth add`.

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode all consume k8sgpt via the same
CLI-Anything wrapper used for Pi (or via the native MCP server for hosts that
support it). Per-host config snippets ship in `tools/<host>-compat-layer/` in F5.

## Auth setup

1. Add an LLM backend: `k8sgpt auth add --backend openai --model gpt-4o-mini`.
   For Azure: `k8sgpt auth add --backend azureopenai --baseurl <endpoint> --engine <deployment>`.
2. Verify backend list: `k8sgpt auth list` — confirm the active backend is marked.
3. Confirm `KUBECONFIG` points to the intended cluster: `kubectl config current-context`.
4. Smoke-test analysis path (read-only): `k8sgpt analyze --anonymize --explain=false`.
5. Verify the MCP server starts: `k8sgpt serve --mcp --anonymize` then issue
   `tools/list` via the MCP host — expect `analyze`, `analyze_pods`, `analyze_services`,
   `analyze_deployments`, and `explain`.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `analyze` | Full cluster/namespace scan; lists Issue objects with severity | `action == "k8sgpt:analyze"` — allow read for incident-response agents |
| `analyze_pods` | Pod-only failure scan (CrashLoop, OOMKilled, ImagePull) | `action == "k8sgpt:analyze_pods"` — allow read; pin `resource.namespace` |
| `analyze_services` | Service/endpoint mismatch detection | `action == "k8sgpt:analyze_services"` — allow read; pin namespace |
| `analyze_deployments` | Deployment rollout / replica failures | `action == "k8sgpt:analyze_deployments"` — allow read; pin namespace |
| `explain` | LLM-narrated remediation suggestion for a finding | `action == "k8sgpt:explain"` — allow only when `principal.role == "triage-analyst"` AND `--anonymize` was set |

## Safety

- Read-only by default: all surfaced tools issue Kubernetes `get`/`list` only;
  k8sgpt itself has no mutation verbs.
- Cedar gating SHOULD pin `resource.namespace` to the incident scope to prevent
  cross-namespace data exfiltration via the LLM call.
- `--anonymize` MUST be enforced at the policy layer — without it, raw pod names,
  image refs, and namespace labels are sent to the upstream LLM provider.
- Prompt-injection caveat: `explain` feeds Kubernetes object names, labels, and
  event messages into the LLM. A hostile workload could embed adversarial strings
  in container args or event messages. Treat `explain` output as untrusted text;
  never auto-execute the suggested remediation.
- The LLM backend is an external trust boundary — pick a provider whose data
  handling matches the cluster's compliance posture.

## Caveats

- The `--mcp` flag was added in k8sgpt v0.3.x and is still maturing; expect tool
  schema changes between minor releases. Pin the binary version in CI.
- `--anonymize` hashes resource names but does NOT redact event message bodies or
  YAML annotations — an operator pasting secrets into annotations will leak them.
- Apache-2.0 license permits vendoring, but the wrapper repo should track upstream
  releases via dependabot to pick up security patches.
- Requires reachable `KUBECONFIG` context; for cross-cluster triage during multi-region
  incidents, switch context before each invocation rather than relying on a default.
- LLM call latency dominates response time (1-5s typical); not suitable for tight
  alert-driven automation loops — use `kubectl`-based MCPs for sub-second checks.

## See also

- `k8s-mcp.md` — raw kubectl surface; pair with k8sgpt for verify-then-explain flows.
- `velociraptor-mcp.md` — host-level forensics when the issue is below the kubelet.
- `grafana-mcp.md` — metrics/logs correlation for k8sgpt findings.
