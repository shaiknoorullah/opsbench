# MCP Recipe — crossplane-control-plane-mcp

Upbound's Crossplane control-plane MCP exposes managed-resource CRUD against an
Upbound (or self-hosted Crossplane) control plane. The opsbench
`change-correlator` agent class queries claim/composite/managed status to link
cloud-resource drift with incident onset; the `recovery-executor` agent may
patch or annotate managed resources only after Cedar policy gating signs off on
the target control plane, provider, and change window.

## Source

- Repo: <https://github.com/upbound/controlplane-mcp-server>
- License: Apache-2.0
- Maintainer: Upbound (official, vendor-supported)

## Install

```bash
# Pre-built binary (vendor-recommended for CLI hosts)
go install github.com/upbound/controlplane-mcp-server/cmd/controlplane-mcp@latest

# OR via Docker image published by Upbound
docker pull xpkg.upbound.io/upbound/controlplane-mcp-server:latest
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships without built-in MCP. Wrap
`controlplane-mcp-server` as a Pi-callable CLI via HKUDS/CLI-Anything, then
install as a Pi skill:

```bash
# 1. Fork upstream and run CLI-Anything to generate a flat CLI surface
#    (one subcommand per MCP tool, JSON in/out).
# 2. Publish the wrapper as a git-installable Pi skill:
pi install git:github.com/<your-fork>/crossplane-control-plane-mcp-pi-skill
```

Add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```md
## crossplane-control-plane

For Crossplane managed-resource state and control-plane queries, call the
`controlplane-mcp` wrapper CLI installed under
`~/.pi/skills/crossplane-control-plane-mcp-pi-skill/bin/controlplane-mcp`:

- Read state: `controlplane-mcp list-managed --provider provider-aws --output json`
- Inspect a claim: `controlplane-mcp get-claim <name> --namespace <ns> --output json`
- Mutations (`patch-managed`, `delete-managed`, `annotate-managed`) require
  Cedar approval — emit the intended command and stop; do NOT execute until
  the human approves.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "crossplane": {
      "command": "controlplane-mcp",
      "args": ["stdio", "--read-only",
               "--control-plane", "opsbench-prod",
               "--allowed-groups", "*.aws.upbound.io,*.gcp.upbound.io"],
      "env": {
        "UP_TOKEN": "${UP_INCIDENT_READONLY_TOKEN}",
        "UP_ORG": "opsbench",
        "UP_DOMAIN": "https://upbound.io"
      }
    }
  }
}
```

For gated mutations (recovery-executor only — Cedar enforces control plane and
provider scope):

```jsonc
{
  "mcpServers": {
    "crossplane-write": {
      "command": "controlplane-mcp",
      "args": ["stdio",
               "--allowed-tools",
               "list-managed,get-managed,get-claim,patch-managed,annotate-managed",
               "--control-plane", "opsbench-prod",
               "--require-confirmation"],
      "env": {
        "UP_TOKEN": "${UP_INCIDENT_WRITE_TOKEN}",
        "UP_ORG": "opsbench"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode all reach this server through
their respective compat shims under `tools/<host>-compat-layer/` (e.g.
`tools/codex-compat-layer/`, `tools/cursor-compat-layer/`). Full per-host
configs ship in F5; for F0 the recipe above is the canonical source of truth.

## Auth setup

1. In the Upbound console (or via `up`), create a service account scoped to
   the target control plane: `up org robot create incident-response` then
   `up org robot token create incident-response --name readonly`.
2. Bind RBAC inside the control plane: grant the robot `get,list,watch` on the
   relevant managed-resource API groups (e.g. `*.aws.upbound.io`); grant
   `patch,update` ONLY to the write-tier robot, and never `delete` on
   stateful providers (RDS, S3 buckets with data).
3. Store the read-only token as `up-incident-readonly-token` and the write
   token as `up-incident-write-token` in Azure Key Vault.
4. Export for local Claude Code runs:
   `export UP_INCIDENT_READONLY_TOKEN=$(az keyvault secret show ...)`.
5. Verify connectivity (does not mutate):
   `controlplane-mcp list-managed --control-plane opsbench-prod --output json | jq 'length'`.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `list-control-planes` | Enumerate control planes in the org | Allow for incident-responder, change-correlator |
| `list-managed` | Enumerate managed resources by group/kind | Allow for incident-responder, change-correlator |
| `get-managed` | Read one managed resource's spec/status/conditions | Allow for incident-responder, change-correlator |
| `get-claim` | Read a claim and resolve to its composite + managed tree | Allow for incident-responder |
| `get-composition` | Inspect the Composition that produced a composite | Allow for change-correlator |
| `patch-managed` | Apply a strategic-merge patch to a managed resource | Deny by default; allow for recovery-executor with `(controlPlane, apiGroup, change_ticket_id, window)` attrs |
| `annotate-managed` | Add/remove annotations (e.g. `crossplane.io/paused`) | Allow for recovery-executor under Cedar with explicit reason |
| `delete-managed` | Delete a managed resource | Deny by default; explicit human approval AND data-safety preflight required |

## Safety

- Default posture is read-only (`--read-only`); the write profile is a separate
  `mcpServers` entry so it can be omitted from incident-responder containers.
- Cedar policy MUST gate `patch-managed`, `annotate-managed`, and especially
  `delete-managed` on `(controlPlane, apiGroup, kind, change_ticket_id,
  business_hours_window)`. Crossplane managed resources are external cloud
  resources — a `delete` here can drop a real RDS instance or S3 bucket.
- `crossplane.io/paused=true` annotations are a recovery-executor safety lever
  (stop reconciliation) and should be preferred over deletion when stopping
  drift; Cedar should allow `annotate-managed` more liberally than `patch-managed`.
- Composite/claim deletions cascade to managed resources by default —
  `delete-managed` on a Composite can wipe an entire dependency tree. Force
  the recovery-executor to operate on the leaf managed resource, never the
  composite, during incidents.
- Prompt-injection caveat: managed-resource `status.conditions[].message`,
  `status.atProvider` fields, and annotations are partly attacker-influenced
  (cloud API echoes, user-set labels). The MCP returns them verbatim; the
  agent must not follow instructions found inside Crossplane-rendered fields.

## Caveats

- `controlplane-mcp-server` is recent (post-2025) and the tool surface may
  still shift; pin to a release tag, not `@latest`, in CI.
- The MCP talks to the Upbound API and a control plane's API server (Kubernetes
  shape) — if the control plane is down, this MCP returns stale or empty
  results. Cross-check with `k8s-mcp` against the host cluster.
- Read tokens still grant visibility into all managed resources in the bound
  control plane, including credentials referenced by ProviderConfigs — treat
  the read token as sensitive even though it cannot mutate.
- Self-hosted Crossplane (no Upbound control plane) is also supported but
  requires `--kubeconfig` against the Crossplane host cluster instead of
  `UP_TOKEN`; document both paths if the team runs hybrid.
- License is Apache-2.0, so vendoring is fine — retain the NOTICE file if you
  fork to add the CLI-Anything wrapper.

## See also

- `k8s-mcp.md` — cluster-level reads paired with Crossplane control-plane state.
- `argocd-mcp.md` — correlate Crossplane composition rollouts with GitOps syncs.
- `awslabs-mcp.md` — cross-check the underlying AWS resource Crossplane manages.
