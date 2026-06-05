# MCP Recipe — argo-workflows-mcp

Wraps the Argo Workflows API so the incident-response responder agent (and, when gated, the
recovery-executor agent) can list workflows, fetch logs, and resubmit failed runs during an
incident — typical scenario: a scheduled data pipeline or post-deploy verification workflow
fails and an on-call agent needs to triage `kubectl`-free, then optionally resubmit once the
upstream cause is cleared.

## Source

- Repo: <https://github.com/Heapy/argo-workflows-mcp>
- License: Apache-2.0
- Maintainer: community (Heapy)

## Install

```bash
# Recommended: run via Docker (server speaks HTTP/SSE, no stdio path upstream)
docker pull ghcr.io/heapy/argo-workflows-mcp:latest

# Or build from source
git clone https://github.com/Heapy/argo-workflows-mcp
cd argo-workflows-mcp && ./gradlew installDist
```

## Configuration — Pi (primary)

Pi has no built-in MCP client and this server exposes only HTTP/SSE (no stdio), so the
Pi-native path is to wrap the upstream server's HTTP surface as a CLI that Pi can shell out
to via Bash. Use [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) to generate a
Pi-callable CLI from the `argo-workflows-mcp` HTTP endpoints, then publish the wrapper as a
Pi skill.

```bash
# 1. Fork CLI-Anything and point it at the argo-workflows-mcp OpenAPI/SSE surface,
#    producing a small CLI named `argo-wf-mcp` with subcommands matching the MCP tools.
# 2. Publish the wrapper to a git repo and install into Pi:
pi install git:github.com/<your-fork>/argo-workflows-mcp-pi-skill
```

Then add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```markdown
## Argo Workflows access

When the user asks about Argo Workflows (failed runs, pipeline status, resubmits), call the
`argo-wf-mcp` CLI rather than `kubectl get wf`:

- `argo-wf-mcp workflow-list --namespace <ns>` — list recent workflows
- `argo-wf-mcp workflow-log --name <wf> --step <step>` — fetch logs for a step
- `argo-wf-mcp workflow-resubmit --name <wf>` — resubmit (requires Cedar approval token)

Read `ARGO_WORKFLOWS_URL` and `ARGO_WORKFLOWS_TOKEN` from the shell environment; never
hardcode. For resubmits, prompt the user for confirmation and pass `--cedar-token` from the
approval flow.
```

## Configuration — Claude Code (secondary)

The upstream server is HTTP/SSE-only. Claude Code MCP supports HTTP transports via the
`url` form:

```jsonc
{
  "mcpServers": {
    "argo-workflows": {
      "url": "http://localhost:8787/sse",
      "transport": "sse",
      "env": {
        "ARGO_WORKFLOWS_URL": "https://argo-server.argo.svc.pnats.cluster.local:2746",
        "ARGO_WORKFLOWS_TOKEN": "${ARGO_WORKFLOWS_TOKEN}"
      }
    }
  }
}
```

Start the server locally (port 8787) before launching Claude Code:

```bash
docker run --rm -p 8787:8787 \
  -e ARGO_WORKFLOWS_URL \
  -e ARGO_WORKFLOWS_TOKEN \
  ghcr.io/heapy/argo-workflows-mcp:latest
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode each need a thin compat shim because their
MCP-equivalent surfaces differ (HTTP/SSE support, env-var passthrough, transport names).
Configs ship in F5 under `tools/<host>-compat-layer/` (one directory per host) — point
each shim at the same `ghcr.io/heapy/argo-workflows-mcp` container.

## Auth setup

1. Create a dedicated Kubernetes ServiceAccount in the Argo namespace:

   ```bash
   kubectl create sa argo-mcp-readonly -n argo
   kubectl create rolebinding argo-mcp-readonly \
     --role=argo-role-readonly --serviceaccount=argo:argo-mcp-readonly -n argo
   ```

2. Mint a long-lived token (or use a projected token for short-lived runs):

   ```bash
   kubectl create token argo-mcp-readonly -n argo --duration=720h > /tmp/argo-token
   ```

3. Store the token in your secret store (Azure Key Vault / 1Password) and export at shell
   init:

   ```bash
   export ARGO_WORKFLOWS_URL="https://argo-server.argo.svc.pnats.cluster.local:2746"
   export ARGO_WORKFLOWS_TOKEN="$(az keyvault secret show \
     --vault-name pn-cluster-keyvault --name argo-mcp-readonly --query value -o tsv)"
   ```

4. For resubmit (mutation) flows, mint a SEPARATE token bound to a role with
   `workflows/resubmit` verb only — never reuse the readonly token.

5. Verify connectivity before binding to Claude / Pi:

   ```bash
   curl -sS -H "Authorization: Bearer $ARGO_WORKFLOWS_TOKEN" \
     "$ARGO_WORKFLOWS_URL/api/v1/workflows/argo" | jq '.items | length'
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `workflow-list` | List recent workflows in a namespace (status, age, phase) | read-only, no gate |
| `workflow-get` | Fetch a single workflow's full spec + status | read-only, no gate |
| `workflow-log` | Stream logs for a workflow step or pod | read-only, redact secrets in transit |
| `workflow-resubmit` | Resubmit a failed workflow with the same parameters | requires Cedar approval + on-call ack |
| `workflow-retry` | Retry from the first failed node (skips successful steps) | requires Cedar approval |
| `workflow-stop` | Gracefully stop a running workflow | requires Cedar approval + reason string |
| `workflow-terminate` | Force-kill a running workflow | requires Cedar approval + on-call ack + audit log |

## Safety

- Read-only by default: when paired with a token bound to a readonly role, the server
  surfaces only `workflow-list`, `workflow-get`, `workflow-log`. Mutation tools fail at the
  Argo API layer (403) before any state change.
- Cedar gating: `workflow-resubmit`, `workflow-retry`, `workflow-stop`, `workflow-terminate`
  must each require an approval policy that checks (a) on-call identity, (b) workflow
  namespace allowlist, (c) explicit reason string. Wire these via the recovery-executor
  agent class — not the responder.
- Mutation gating must also cap blast radius: deny resubmit on workflows that mutate
  external systems (e.g., billing, customer email) without a second-human approval.
- Prompt-injection caveat: workflow step names, parameters, and log output are
  attacker-influenced (especially logs from third-party API calls inside steps). Treat all
  log content as untrusted — never let it auto-trigger further tool calls without a Cedar
  check.

## Caveats

- HTTP/SSE only — no stdio transport. Every host needs a long-running server process
  (Docker container or sidecar); this complicates ephemeral CLI use vs. stdio servers.
- Beta-ish: community-maintained, not Argo project official. Track upstream for breaking
  changes in workflow status schema (Argo 3.5 → 3.6 changed `outputs.parameters` shape).
- License is Apache-2.0 — safe to vendor or fork for the Pi wrapper. (Contrast with AGPL
  servers which we never vendor — see grafana-mcp.md.)
- Infra prereqs: Argo Workflows server must be reachable from wherever the MCP container
  runs. For the OVH cluster, that means either running the MCP inside the cluster as a
  sidecar OR routing through the existing SSH tunnel (`ovh-kubeconfig.service`).
- The `workflow-log` tool currently returns the full step log in a single response — long
  steps (>1MB logs) may truncate. Use `--tail` / `--since` args when available.

## See also

- `k8s-mcp.md` — for raw pod/log access when a workflow step's pod is still around
- `grafana-mcp.md` — to correlate workflow failure timestamps with Loki/Tempo traces
- `pagerduty-mcp.md` — to ack/resolve the page once a resubmit succeeds
