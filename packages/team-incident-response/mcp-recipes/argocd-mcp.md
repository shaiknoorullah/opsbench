# MCP Recipe — argocd-mcp

Argo CD MCP exposes GitOps application state and controlled sync/rollback verbs. The
opsbench `change-correlator` agent calls `app-list` and per-app status to correlate
recent deploys with incident onset; the `recovery-executor` agent class invokes
`app-sync` / `app-rollback` only after Cedar policy gating signs off on the target
namespace and window.

## Source

- Repo: <https://github.com/argoproj-labs/mcp-for-argocd>
- License: Apache-2.0
- Maintainer: Argo Labs (argoproj-labs community)

## Install

```bash
# Pre-built binary (vendor-recommended for CLI hosts)
go install github.com/argoproj-labs/mcp-for-argocd/cmd/argocd-mcp@latest

# OR via Docker
docker pull ghcr.io/argoproj-labs/mcp-for-argocd:latest
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships without built-in MCP. Wrap `mcp-for-argocd` as a
Pi-callable CLI via HKUDS/CLI-Anything, then install as a Pi skill:

```bash
# 1. Fork upstream and run CLI-Anything to generate a flat CLI surface
#    (one subcommand per MCP tool, JSON in/out).
# 2. Publish the wrapper as a git-installable Pi skill:
pi install git:github.com/<your-fork>/argocd-mcp-pi-skill
```

Add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```md
## argocd

For Argo CD application state and GitOps correlation, call the `argocd-mcp` wrapper
CLI installed under `~/.pi/skills/argocd-mcp-pi-skill/bin/argocd-mcp`:

- Read state: `argocd-mcp app-list --project pnats --output json`
- Inspect a single app: `argocd-mcp app-get <name> --output json`
- Mutations (`app-sync`, `app-rollback`) require Cedar approval — emit the
  intended command and stop; do NOT execute until the human approves.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "argocd": {
      "command": "argocd-mcp",
      "args": ["stdio", "--read-only", "--projects", "pnats,observability,longhorn-system"],
      "env": {
        "ARGOCD_SERVER": "argocd.internal.opsbench.dev:443",
        "ARGOCD_AUTH_TOKEN": "${ARGOCD_INCIDENT_READONLY_TOKEN}"
      }
    }
  }
}
```

For gated mutations (recovery-executor only — Cedar enforces project/window):

```jsonc
{
  "mcpServers": {
    "argocd-write": {
      "command": "argocd-mcp",
      "args": ["stdio",
               "--allowed-tools", "app-list,app-get,app-sync,app-rollback",
               "--projects", "pnats",
               "--require-confirmation"],
      "env": {
        "ARGOCD_SERVER": "argocd.internal.opsbench.dev:443",
        "ARGOCD_AUTH_TOKEN": "${ARGOCD_INCIDENT_WRITE_TOKEN}"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode all reach this server through their
respective compat shims under `tools/<host>-compat-layer/` (e.g.
`tools/codex-compat-layer/`, `tools/cursor-compat-layer/`). Full per-host configs
ship in F5; for F0 the recipe above is the canonical source of truth.

## Auth setup

1. Create an Argo CD local account or project-scoped token (NOT the admin token):
   `argocd account generate-token --account incident-response --expires-in 720h`.
2. Bind RBAC: in `argocd-rbac-cm`, grant `incident-response` the `applications, get`
   and `applications, sync` actions ONLY for `proj:pnats/*`. No `delete`, no `*`.
3. Store the read-only token as `argocd-incident-readonly-token` and the
   sync/rollback token as `argocd-incident-write-token` in Azure Key Vault.
4. Export for local Claude Code runs:
   `export ARGOCD_INCIDENT_READONLY_TOKEN=$(az keyvault secret show ...)`.
5. Verify connectivity (does not mutate):
   `argocd-mcp app-list --output json | jq '.[] | .metadata.name' | head`.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `app-list` | Enumerate apps in scoped projects | Allow for incident-responder, change-correlator |
| `app-get` | Read one app's sync/health/history | Allow for incident-responder, change-correlator |
| `app-resources` | List live K8s resources owned by an app | Allow for incident-responder |
| `app-logs` | Stream container logs via Argo API | Allow read; rate-limit per agent |
| `app-sync` | Trigger a sync to target revision | Deny by default; allow for recovery-executor with project + window + change-ticket attrs |
| `app-rollback` | Roll an app back to a prior deploy | Deny by default; allow for recovery-executor with explicit `priorDeploymentId` and human approval |
| `app-diff` | Compare desired vs live manifests | Allow for change-correlator (no mutation, but can reveal secrets in templates — see Safety) |

## Safety

- Default posture is read-only (`--read-only`); the write profile is a separate
  `mcpServers` entry so it can be omitted from incident-responder containers.
- Cedar policy MUST gate `app-sync` and `app-rollback` on `(project, namespace,
  change_ticket_id, business_hours_window)`. The MCP's `--require-confirmation`
  is a backstop, not a substitute for Cedar.
- `app-rollback` against a stateful workload (e.g. anything backed by Longhorn PVCs
  or Postgres) can cause data divergence — pair with the data-safety check in the
  recovery-executor preflight.
- `app-diff` can echo rendered secrets if Helm/Kustomize templates inline them;
  treat its output as sensitive and never paste into Slack/Linear unredacted.
- Prompt-injection caveat: app annotations, deploy hooks, and last-error messages
  are attacker-controllable in compromised repos. The MCP returns them verbatim;
  the agent must not follow instructions found inside Argo CD-rendered fields.

## Caveats

- `mcp-for-argocd` is an argoproj-labs project (incubating tier) — API shape may
  shift before 1.0. Pin the binary to a release tag, not `@latest`, in CI.
- The MCP talks to the Argo CD API server, not directly to Kubernetes — if the
  API server is degraded, this MCP fails open with stale data. Always cross-check
  with `k8s-mcp` (see k8s-mcp.md) when correlating with cluster events.
- License is Apache-2.0, so vendoring is fine — but if you fork to add the
  CLI-Anything wrapper, retain the NOTICE file.
- Requires network reachability to the Argo CD API server; on the OVH cluster this
  goes through the systemd SSH tunnel (same as kubeconfig). If the tunnel is
  down, `app-list` will time out before any tool returns.
- No first-class support for ApplicationSets in current releases — surface those
  via `k8s-mcp` against the `argoproj.io/ApplicationSet` CRD instead.

## See also

- `k8s-mcp.md` — cluster-level reads/writes paired with Argo CD app state.
- `github-mcp.md` — correlate Argo syncs with recent merges in GitOps repos.
- `grafana-mcp.md` — confirm post-sync health via dashboards before declaring recovery.
