# MCP Recipe — crossplane-mcp

Crossplane MCP exposes the Crossplane control-plane surface (compositions, providers,
claims, managed resources) as read-only MCP tools backed by a kubeconfig. The opsbench
`infra-correlator` agent calls it during incidents to determine whether a degraded
managed resource (RDS, GCS bucket, DNS record) is the cause of a downstream symptom,
and the `change-correlator` agent uses composition revisions to correlate platform
drift with incident onset. No write verbs are exposed — reconcile or pause operations
go through `k8s-mcp` with explicit Cedar gating.

## Source

- Repo: <https://github.com/briferz/crossplane-mcp>
- License: Apache-2.0
- Maintainer: community (briferz)

## Install

```bash
# Pre-built binary (vendor-recommended for CLI hosts)
go install github.com/briferz/crossplane-mcp/cmd/crossplane-mcp@latest

# OR clone + build (pinned tag preferred for incident-response use)
git clone https://github.com/briferz/crossplane-mcp.git
cd crossplane-mcp && go build -o ./bin/crossplane-mcp ./cmd/crossplane-mcp
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships without built-in MCP. Wrap `crossplane-mcp` as a
Pi-callable CLI via HKUDS/CLI-Anything, then install as a Pi skill:

```bash
# 1. Fork upstream and run CLI-Anything to generate a flat CLI surface
#    (one subcommand per MCP tool, JSON in/out).
# 2. Publish the wrapper as a git-installable Pi skill:
pi install git:github.com/<your-fork>/crossplane-mcp-pi-skill
```

Add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```md
## crossplane

For Crossplane control-plane reads (compositions, providers, claims), call the
`crossplane-mcp` wrapper CLI installed under
`~/.pi/skills/crossplane-mcp-pi-skill/bin/crossplane-mcp`:

- List compositions: `crossplane-mcp compositions-list --output json`
- Inspect a provider: `crossplane-mcp providers-get <name> --output json`
- Read claim status: `crossplane-mcp claims-get <kind>/<name> -n <ns> --output json`

This wrapper is read-only by design. For reconcile/pause/delete on managed
resources, hand off to the `k8s-mcp` wrapper and emit the intended command for
Cedar approval — do NOT shell out to `kubectl` directly from here.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "crossplane": {
      "command": "crossplane-mcp",
      "args": ["stdio", "--read-only"],
      "env": {
        "KUBECONFIG": "${HOME}/.kube/opsbench-incident-readonly.config"
      }
    }
  }
}
```

For multi-cluster fleets (one Crossplane control plane per region), shard by
KUBECONFIG context:

```jsonc
{
  "mcpServers": {
    "crossplane-ovh": {
      "command": "crossplane-mcp",
      "args": ["stdio", "--read-only", "--context", "ovh-prod"],
      "env": { "KUBECONFIG": "${HOME}/.kube/opsbench-incident-readonly.config" }
    },
    "crossplane-aws": {
      "command": "crossplane-mcp",
      "args": ["stdio", "--read-only", "--context", "aws-prod"],
      "env": { "KUBECONFIG": "${HOME}/.kube/opsbench-incident-readonly.config" }
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

1. Create a dedicated ServiceAccount in the Crossplane system namespace:
   `kubectl -n crossplane-system create sa incident-response-readonly`.
2. Bind a read-only ClusterRole covering `compositions`, `compositionrevisions`,
   `providers`, `providerconfigs`, `*.claim` and `*.managed` CRDs — never `*` and
   never `secrets`. Apply the ClusterRoleBinding to the SA above.
3. Mint a kubeconfig scoped to that SA token and write it to
   `~/.kube/opsbench-incident-readonly.config` (chmod 600). Store the source token
   in Azure Key Vault as `crossplane-incident-readonly-kubeconfig`.
4. Export for local Claude Code / Pi runs:
   `export KUBECONFIG=$HOME/.kube/opsbench-incident-readonly.config`.
5. Verify connectivity (does not mutate):
   `crossplane-mcp compositions-list --output json | jq '.[].metadata.name' | head`.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `compositions-list` | Enumerate XRDs/Compositions in the control plane | Allow for incident-responder, change-correlator |
| `compositions-get` | Read a single Composition + its current revision | Allow for incident-responder, change-correlator |
| `composition-revisions-list` | List revision history for drift / change correlation | Allow for change-correlator |
| `providers-list` | Enumerate installed Crossplane providers + health | Allow for incident-responder |
| `providers-get` | Read a provider's status, version, conditions | Allow for incident-responder |
| `claims-list` | List claims (namespaced) across scoped projects | Allow for incident-responder |
| `claims-get` | Read a claim's status, conditions, bound XR | Allow for incident-responder |

## Safety

- Default posture is read-only — the upstream MCP surfaces no mutation verbs in
  current releases, and the `--read-only` flag is set defensively for forward
  compatibility. Treat any future write tools as deny-by-default in Cedar.
- Cedar policy MUST scope reads by namespace and composition group. Claims often
  reference cross-tenant managed resources; leaking a claim status to the wrong
  agent leaks the existence of a tenant's RDS/GCS asset.
- Composition specs and provider configs MAY embed connection-secret references.
  Although this MCP does not dereference secrets, the names alone (e.g. an S3
  bucket ARN inside a status field) are sensitive — redact before paste into
  Slack/Linear.
- Mutation gating: any reconcile / pause / delete on managed resources happens
  through `k8s-mcp` with full Cedar `(namespace, group, ticket, window)` checks.
  This MCP must never be granted write RBAC.
- Prompt-injection caveat: Composition annotations, provider status messages, and
  claim conditions are attacker-controllable when the platform repo or upstream
  provider is compromised. The MCP returns them verbatim; the agent must not
  follow instructions embedded in these fields.

## Caveats

- Community project, pre-1.0 — pin a specific commit / release tag, not `@latest`,
  for incident-response containers. API shape may shift.
- Apache-2.0, so vendoring is permitted; if you fork to add the CLI-Anything
  wrapper, retain the NOTICE file.
- Requires the Crossplane control plane to be reachable via the same kubeconfig
  used by `k8s-mcp`. If the OVH SSH tunnel is down, reads fail the same way.
- Does NOT understand provider-specific resource semantics (e.g. it will not tell
  you why an AWS RDS instance is in `Modifying` — fetch that via the AWS MCP).
  Treat this MCP as a control-plane lens, not a cloud-resource oracle.
- No streaming or watch support today — polling-only. For long-running reconcile
  observation, prefer `k8s-mcp` watch on the underlying managed resource.

## See also

- `k8s-mcp.md` — cluster-level reads and (Cedar-gated) writes for managed resources.
- `argocd-mcp.md` — correlate Crossplane control-plane drift with GitOps deploys.
- `aws-mcp.md` — drill into provider-specific status when a managed resource degrades.
