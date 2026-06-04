# MCP Recipe — argocd-akuity-mcp

The opsbench `team-incident-response` deploy-investigator and rollback-coordinator agents
call this recipe during GitOps incidents where they need an alternative Argo CD MCP
implementation maintained by the original Argo creators at Akuity. Pair this with the
Akuity Promotion Advisor when investigating multi-environment promotion failures, drift
between dev/stage/prod, or sync-loop pathologies that the upstream `argoproj-labs`
implementation handles differently.

## Source

- Repo: <https://github.com/akuity/argocd-mcp>
- License: Apache-2.0
- Maintainer: Akuity (original Argo creators)

## Install

```bash
# npm (vendor-recommended)
npm install -g @akuity/argocd-mcp

# Or run on-demand via npx (no global install)
npx -y @akuity/argocd-mcp@latest --help
```

## Configuration — Pi (primary)

Pi has no built-in MCP. Use the [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything)
wrap path to generate a Pi-callable CLI from `akuity/argocd-mcp`, fork the generated
skill, and install it via Pi's extension system:

```bash
# Generate the Pi skill from upstream (one-time, in your fork repo)
cli-anything wrap \
  --source github.com/akuity/argocd-mcp \
  --out argocd-akuity-pi-skill \
  --transport stdio

# Install the wrapped CLI into Pi
pi install git:github.com/<your-fork>/argocd-akuity-pi-skill
```

Add the following snippet to `~/.pi/agent/AGENTS.md` (or a per-project `AGENTS.md`) to
direct the agent toward the wrapper CLI:

```markdown
## Argo CD (Akuity) tooling

When investigating GitOps sync failures, drift, or promotion issues:

- Prefer `argocd-akuity` CLI over raw `argocd` for read-heavy investigation.
- Default to read-only subcommands (`list-apps`, `get-app`, `app-history`, `diff`).
- Mutation subcommands (`sync`, `rollback`, `delete-app`) require explicit operator
  confirmation; never invoke them from autonomous loops.
- For multi-cluster promotion investigation, pair with the Akuity Promotion Advisor.
```

A per-project `SYSTEM.md` can further restrict which apps/projects the agent may query
(useful for tenant isolation).

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "argocd-akuity": {
      "command": "npx",
      "args": ["-y", "@akuity/argocd-mcp@latest", "--transport", "stdio", "--read-only"],
      "env": {
        "ARGOCD_SERVER": "argocd.ap-south-1.pnats.cloud",
        "ARGOCD_AUTH_TOKEN": "${ARGOCD_AUTH_TOKEN}",
        "ARGOCD_INSECURE": "false"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode each get a thin compatibility shim that
re-exports the same stdio entrypoint with host-specific config. See
`tools/codex-compat-layer/`, `tools/copilot-compat-layer/`, `tools/cursor-compat-layer/`,
`tools/gemini-compat-layer/`, and `tools/opencode-compat-layer/`. Full configs ship in F5.

## Auth setup

1. In the Argo CD UI, create a local account or use an existing SSO-backed account with
   role `readonly` (or a project-scoped role for tenant isolation).
2. Generate an API token: `argocd account generate-token --account opsbench-mcp`.
   Tokens for local accounts are preferred over user JWTs — they persist beyond
   user offboarding and have explicit RBAC bindings.
3. Store the token in Azure Key Vault (or 1Password). Reference via env var:

   ```bash
   export ARGOCD_AUTH_TOKEN="$(az keyvault secret show \
     --vault-name pn-cluster-keyvault \
     --name argocd-akuity-mcp-readonly-token \
     --query value -o tsv)"
   ```

4. For Akuity Platform (hosted Argo CD), use an Akuity API key scoped to the relevant
   instance instead — set `AKUITY_API_KEY` in place of `ARGOCD_AUTH_TOKEN`.
5. Verify the token works before wiring the MCP:

   ```bash
   ARGOCD_AUTH_TOKEN="$ARGOCD_AUTH_TOKEN" \
     argocd app list --server argocd.ap-south-1.pnats.cloud --grpc-web
   # Should print the apps visible to the readonly account.
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `list_applications` | Enumerate Argo CD apps visible to the token | allow (read-only) |
| `get_application` | Fetch app status, sync state, health, last operation | allow (read-only) |
| `get_application_manifests` | Render live + desired manifests for diff analysis | allow (read-only) |
| `get_application_resource_tree` | Walk the resource graph for an app | allow (read-only) |
| `get_application_events` | Retrieve recent k8s events for app resources | allow (read-only) |
| `sync_application` | Trigger a sync of an app to its target revision | deny by default; allow only with `incident_active=true` AND operator approval |
| `rollback_application` | Roll an app back to a prior deploy history entry | deny by default; require dual-operator approval + change ticket |

## Safety

- Default-on `--read-only` flag at MCP startup disables all mutation tools; mutations
  require explicit re-launch or a separate write-scoped MCP instance.
- Cedar policy gates `sync_application` and `rollback_application` behind an active
  incident context plus operator approval; never expose to autonomous loops.
- Token scope SHOULD be project-bound (Argo CD `AppProject` RBAC) so the MCP cannot see
  unrelated tenants even if compromised.
- Prompt-injection caveat: Argo CD app annotations and resource manifests are
  agent-readable; treat any field traversed via `get_application_manifests` as untrusted
  input. Strip or quarantine annotations like `argocd.argoproj.io/hook` before passing
  excerpts back into the LLM context.
- Avoid pointing the MCP at production `argocd-server` directly during dev — use a
  read-replica or the Akuity hosted control plane's read endpoint.

## Caveats

- Alternative implementation: the Akuity build and the `argoproj-labs/argocd-mcp` build
  expose overlapping but non-identical tool surfaces. When switching between them,
  re-validate Cedar policies and AGENTS.md tool references.
- Some advanced tools (Promotion Advisor integration, multi-instance app aggregation)
  require the Akuity Platform (paid) rather than self-hosted Argo CD; degrade
  gracefully when those endpoints return 404.
- Apache-2.0 licensed — safe to vendor or fork. Forks should preserve the NOTICE file
  and attribution to Akuity.
- Infra prereqs: an Argo CD instance reachable from the MCP host (gRPC-Web on 443 is
  the default), a token with at minimum `applications, get` and `applications, list`
  permissions, and outbound TLS allowed by the host firewall.
- Token rotation: Argo CD local-account tokens do not auto-rotate; schedule rotation
  via the platform team's secret rotation policy (90-day default).

## See also

- `argocd-mcp.md` — the upstream `argoproj-labs/argocd-mcp` alternative (primary in
  most opsbench rotations).
- `k8s-mcp.md` — pairs with this recipe for live resource inspection after a sync.
- `github-mcp.md` — pairs with this recipe to inspect the Git source-of-truth for a
  drift incident.
