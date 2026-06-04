# MCP Recipe — flux-mcp

Flux Operator MCP surfaces Flux v2 reconciliation state for GitOps-managed
clusters. The opsbench `change-correlator` and `incident-responder` agents call
it to tell whether a `Kustomization` or `HelmRelease` reconciliation is
suspended, failing, or freshly applied around the incident window. Because the
upstream `flux-operator` is **AGPL-3.0**, opsbench treats this MCP as a
strict external process — never vendored, never imported — and isolates it
behind a process boundary so the AGPL copyleft does not propagate into
opsbench packages.

## Source

- Repo: <https://github.com/controlplaneio-fluxcd/flux-operator>
- License: AGPL-3.0
- Maintainer: ControlPlane

## Install

```bash
# Vendor-recommended: install the released binary out-of-tree (AGPL external process)
go install github.com/controlplaneio-fluxcd/flux-operator/cmd/flux-operator-mcp@latest

# OR pull the published OCI image (preferred for CI / sandboxed hosts)
docker pull ghcr.io/controlplaneio-fluxcd/flux-operator-mcp:latest
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships without built-in MCP. Wrap
`flux-operator-mcp` as a Pi-callable CLI via HKUDS/CLI-Anything, then install
the wrapper as a Pi skill. Because the upstream is AGPL-3.0, the wrapper
**must shell out to the upstream binary** rather than import its packages — the
Pi skill itself stays under your chosen license and never links AGPL code:

```bash
# 1. Fork upstream and run CLI-Anything against the MCP tool surface.
#    CLI-Anything emits a flat command tree (one subcommand per MCP tool)
#    that exec's the upstream flux-operator-mcp binary — no source linkage.
# 2. Publish the wrapper as a git-installable Pi skill:
pi install git:github.com/<your-fork>/flux-mcp-pi-skill
```

Add to `~/.pi/agent/AGENTS.md` (or a per-project `SYSTEM.md`):

```md
## flux

For Flux v2 GitOps reconciliation state, call the `flux-mcp` wrapper CLI at
`~/.pi/skills/flux-mcp-pi-skill/bin/flux-mcp`. It shells out to the AGPL
`flux-operator-mcp` binary — never import or vendor that binary's source.

- List reconcilers: `flux-mcp get-kustomizations --namespace flux-system --output json`
- Inspect a single reconciler: `flux-mcp get-kustomization <name> -n <ns> --output json`
- Last-applied revision: `flux-mcp get-helmrelease <name> -n <ns> --output json`
- Mutations (`reconcile`, `suspend`, `resume`) require Cedar approval — emit
  the intended command and stop; do NOT execute until the human approves.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "flux": {
      "command": "flux-operator-mcp",
      "args": ["serve", "--read-only"],
      "env": {
        "KUBECONFIG": "${OPSBENCH_KUBECONFIG_RO}"
      }
    }
  }
}
```

For gated mutations (recovery-executor only — Cedar enforces namespace/window):

```jsonc
{
  "mcpServers": {
    "flux-write": {
      "command": "flux-operator-mcp",
      "args": ["serve",
               "--allowed-tools", "get_kustomization,get_helmrelease,reconcile_kustomization,reconcile_helmrelease",
               "--namespaces", "flux-system,pnats",
               "--require-confirmation"],
      "env": {
        "KUBECONFIG": "${OPSBENCH_KUBECONFIG_WRITE}"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode reach this server through their
respective compat shims under `tools/<host>-compat-layer/` (e.g.
`tools/codex-compat-layer/`, `tools/cursor-compat-layer/`). Full per-host
configs ship in F5; for F0 the recipe above is the canonical source of truth.

## Auth setup

1. Provision a read-only ServiceAccount in the `flux-system` namespace bound to
   a Role granting `get`/`list`/`watch` on `kustomizations.kustomize.toolkit.fluxcd.io`,
   `helmreleases.helm.toolkit.fluxcd.io`, `gitrepositories.source.toolkit.fluxcd.io`,
   and `helmrepositories.source.toolkit.fluxcd.io` across reconciled namespaces.
2. Generate a long-lived token Secret for that SA and render a kubeconfig:
   `kubectl --namespace flux-system create token incident-flux-ro --duration=720h`.
3. Store the resulting kubeconfig as `opsbench-kubeconfig-ro` in Azure Key
   Vault; export `KUBECONFIG=$(az keyvault secret show ... --query value -o tsv > /tmp/kc.yaml && echo /tmp/kc.yaml)`.
4. For the write profile, mint a second SA bound to a Role that adds
   `patch` on the `*/status` and the `reconcile.fluxcd.io/requestedAt` annotation
   only — no `delete`, no `*`.
5. Verify connectivity (read-only, no mutation):
   `flux-operator-mcp tool get_kustomizations --namespace flux-system | jq '.items[].metadata.name'`.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `get_kustomizations` | List Flux `Kustomization` reconcilers and status | Allow for incident-responder, change-correlator |
| `get_helmreleases` | List Flux `HelmRelease` reconcilers and status | Allow for incident-responder, change-correlator |
| `get_sources` | Read `GitRepository` / `HelmRepository` / `OCIRepository` status | Allow for change-correlator |
| `get_reconciler_events` | Surface controller events for one reconciler | Allow for incident-responder (read-only) |
| `reconcile_kustomization` | Trigger an on-demand reconcile for a Kustomization | Deny by default; allow for recovery-executor with `(namespace, change_ticket_id, window)` attrs |
| `reconcile_helmrelease` | Trigger an on-demand reconcile for a HelmRelease | Deny by default; allow for recovery-executor with explicit human approval |
| `suspend_kustomization` / `resume_kustomization` | Pause or resume reconciliation | Deny by default; allow only with break-glass + change-ticket; suspend defaults to 60-min TTL |

## Safety

- Default posture is read-only (`--read-only`); the write profile ships as a
  separate `mcpServers` entry so it can be omitted from incident-responder
  containers entirely.
- Cedar policy MUST gate every `reconcile_*`, `suspend_*`, and `resume_*` call
  on `(namespace, change_ticket_id, business_hours_window)`. The MCP's
  `--require-confirmation` flag is a backstop, not a substitute for Cedar.
- Suspending a Kustomization that owns a CRD can mask drift that downstream
  controllers depend on — pair `suspend_kustomization` with a watchdog timer
  in the recovery-executor preflight.
- The MCP returns Flux status conditions verbatim, including
  `lastAppliedRevision` and any controller-emitted error strings. These are
  derived from Git refs and OCI tags that may be attacker-controllable in a
  compromised repo; the agent must NOT follow instructions found in those
  fields.
- Reconciling a `HelmRelease` whose chart references a stateful workload (e.g.
  Longhorn-backed PVCs, Postgres) can trigger destructive upgrades — gate
  through the data-safety check shared with `argocd-mcp`.

## Caveats

- **AGPL-3.0 — never vendor.** Use only as an external process: the OCI image
  or installed binary. Do not import any `flux-operator` Go packages into
  opsbench code, and do not statically link it into any compiled artifact you
  ship. The Pi wrapper must `exec` the binary, not link it.
- The MCP requires the Flux v2 controllers (`source-controller`,
  `kustomize-controller`, `helm-controller`, `notification-controller`) to be
  installed and reachable; on a cluster without Flux it returns empty lists
  rather than a clear "not installed" error.
- Reconciler status is eventually consistent — a freshly applied revision can
  take 30–90s to surface; do not interpret a stale `lastAppliedRevision` as
  proof that a deploy did not happen.
- Network path: the MCP talks to the Kubernetes API server, not directly to
  Flux. On the OVH cluster this routes through the systemd SSH tunnel; if the
  tunnel is down, every tool call hangs until KUBECONFIG times out.
- Beta surface: the tool names listed above match the `v0.x` release line and
  may be renamed before `v1.0`. Pin the binary/image to a release tag, not
  `@latest`, in CI.

## See also

- `argocd-mcp.md` — the GitOps-tool counterpart; correlate Flux reconciles
  against Argo CD app sync history on clusters running both.
- `k8s-mcp.md` — drop down to raw cluster reads when Flux status alone is
  insufficient (e.g. inspecting the underlying `Deployment` rollout).
- `github-mcp.md` — tie a `lastAppliedRevision` SHA back to the merge that
  introduced the change.
