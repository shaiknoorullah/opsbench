# MCP Recipe — terraform-mcp

HashiCorp's Terraform MCP server surfaces the public Registry (providers,
modules, policies) and — when a token is supplied — HCP Terraform / Terraform
Enterprise workspaces, runs, and variable sets. Called by the opsbench
**diff-inspector** (resolve provider/module versions referenced in changed
`.tf` files), the **change-correlator** (recent HCP runs preceding the
incident window), and the **mitigation-author** (queue a remediation `plan`
in HCP/TFE behind explicit human confirmation). Read-only by default;
`create_run` / `apply_run` / `discard_run` paths are Cedar-gated and require
a human approver.

## Source

- Repo: <https://github.com/hashicorp/terraform-mcp-server>
- License: MPL-2.0
- Maintainer: HashiCorp (official)

## Install

```bash
# Pre-built binary (recommended for hosts that exec a local command)
curl -L -o /usr/local/bin/terraform-mcp-server \
  https://github.com/hashicorp/terraform-mcp-server/releases/latest/download/terraform-mcp-server-linux-amd64
chmod +x /usr/local/bin/terraform-mcp-server

# OR via Docker (HashiCorp publishes to ghcr.io and Docker Hub)
docker pull hashicorp/terraform-mcp-server:latest
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally avoids built-in MCP. For terraform-mcp, the
HashiCorp CLI (`terraform`) plus the HCP Terraform API already cover most of
the registry-lookup and workspace surface that opsbench needs — Pi should
shell out to `terraform` directly for local validate/plan/fmt and to `curl`
against the HCP API for workspace/run queries. For the MCP-only ergonomics
(grouped registry queries, structured policy search, mode-gated enterprise
tools), wrap the upstream binary with
[HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) so Pi can install
it as a skill:

```bash
# Install the terraform CLI on the Pi host (covers fmt / validate / plan)
sudo apt-get install terraform   # or: brew install hashicorp/tap/terraform
terraform -version

# Install the CLI-Anything wrapper as a Pi skill for the MCP-specific paths
pi install git:github.com/<your-fork>/terraform-mcp-pi-skill
```

AGENTS.md snippet (place in `~/.pi/agent/AGENTS.md` or project root):

```markdown
## Terraform access

Prefer the local `terraform` CLI for code-level operations:

- `terraform fmt -check`, `terraform validate`, `terraform plan -no-color`
- `terraform providers` to enumerate referenced provider versions

For registry/policy lookups and HCP/TFE workspace/run queries, use the
wrapped MCP skill (registry mode is always-on; enterprise mode requires
`TF_CLOUD_TOKEN`):

- `terraform-mcp-skill registry get-provider --name aws --version latest`
- `terraform-mcp-skill registry search-modules --query "vpc aws"`
- `terraform-mcp-skill hcp list-workspaces --org <org>`
- `terraform-mcp-skill hcp list-runs --workspace <ws>`

Never invoke `create_run` / `apply_run` / `discard_run` without explicit
user confirmation in-chat — the wrapper enforces `--require-confirmation`
on these paths and a Cedar policy check runs server-side.
```

## Configuration — Claude Code (secondary)

Read-only (registry-only; default for diff-inspector and change-correlator):

```jsonc
{
  "mcpServers": {
    "terraform": {
      "command": "terraform-mcp-server",
      "args": ["stdio"]
    }
  }
}
```

With HCP Terraform / TFE enterprise tools enabled (workspace + run access):

```jsonc
{
  "mcpServers": {
    "terraform-hcp": {
      "command": "terraform-mcp-server",
      "args": [
        "stdio",
        "--enable-tfe-tools",
        "--require-confirmation"
      ],
      "env": {
        "TF_CLOUD_TOKEN": "${TF_CLOUD_INCIDENT_TOKEN}",
        "TFE_ADDRESS": "https://app.terraform.io"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini CLI, and OpenCode each need a thin shim that
maps their host-native tool config onto either the upstream binary or the
CLI-Anything wrapper above. Full host configs ship in **F5** under
`tools/codex-compat-layer/`, `tools/copilot-compat-layer/`,
`tools/cursor-compat-layer/`, `tools/gemini-compat-layer/`, and
`tools/opencode-compat-layer/`.

## Auth setup

1. The registry tools (`get_provider_*`, `search_modules`, `search_policies`)
   require **no auth** — they hit the public Terraform Registry.
2. For HCP Terraform / Terraform Enterprise, create a **team or user API
   token** at `https://app.terraform.io/app/settings/tokens` (or your TFE
   host's equivalent). Scope to the smallest org/workspace set the incident
   agent needs to inspect.
3. Read-only token: assign to a team with `read` on workspaces, runs, and
   variables — never `plan` or `apply`. The mitigation-author write path
   uses a separate token with `plan` permission only (apply still requires a
   human approver in HCP).
4. Store `TF_CLOUD_TOKEN` in your secret manager (Azure Key Vault /
   1Password / Vault); never inline into `mcpServers.env`. The MCP server
   also accepts `TFE_TOKEN` for self-hosted Enterprise installs.
5. Verify the token reaches HCP:

   ```bash
   curl -sS \
     --header "Authorization: Bearer $TF_CLOUD_INCIDENT_TOKEN" \
     --header "Content-Type: application/vnd.api+json" \
     https://app.terraform.io/api/v2/account/details | jq .data.attributes.username
   # Should print your HCP username; should 401 without the token.
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `get_latest_provider_version` / `get_provider_details` | Resolve provider versions referenced in changed `.tf` files | None (read-only, public registry) |
| `search_modules` / `get_module_details` | Find canonical modules to replace ad-hoc resources | None (read-only, public registry) |
| `search_policies` / `get_policy_details` | Surface Sentinel/OPA policies relevant to a failing run | None (read-only, public registry) |
| `list_workspaces` / `get_workspace_details` | Map an affected service to its HCP workspace + state | None (read-only); allowlist org |
| `list_runs` / `get_run_details` | Correlate recent applies/plans with the incident window | None (read-only); cap run-count |
| `create_run` | Queue a remediation `plan` in HCP/TFE | `Action::"terraform:createRun"` + human-in-loop |
| `apply_run` / `discard_run` / `cancel_run` | Land or abort a queued run | Never agent-driven; require human approver in HCP |

## Safety

- Default config exposes **registry tools only** — no token, no HCP access,
  no mutation surface. Enable `--enable-tfe-tools` only for agents that
  genuinely need workspace/run visibility.
- `--require-confirmation` forces an interactive yes/no before `create_run`,
  `apply_run`, `discard_run`, and `cancel_run` even when a write-capable
  token is loaded.
- Mutations gated through Cedar: `Action::"terraform:createRun"`,
  `Action::"terraform:applyRun"`, `Action::"terraform:discardRun"`
  (`applyRun` denied by default; `createRun` allow-list scoped to specific
  workspaces).
- HCP team permissions enforce workspace allowlist server-side — even if
  the agent attempts an out-of-scope workspace it 403s.
- Prompt-injection: module READMEs, provider docs, and run output (plan
  diffs, error messages) are all attacker-influenceable. Treat plan output
  as untrusted text; never let a plan's stderr trigger another tool call
  without confirmation.

## Caveats

- The MCP server is relatively new (pre-1.0); tool names and `--enable-*`
  flag set may shift between minor releases. Pin a release tag in the
  install step rather than `latest`.
- Registry queries are cached upstream but not by the server — repeated
  `get_provider_details` calls during a fan-out hit the public Registry
  every time. Cache aggressively at the agent layer.
- HCP API rate limits (~30 req/sec per token) can throttle wide workspace
  scans mid-incident. Prefer `search_workspaces` with a query over
  enumerating all workspaces.
- License is MPL-2.0 — safe to vendor with attribution; modifications to
  the MCP server's own source must remain MPL-2.0, but downstream code
  that merely calls it is unaffected.
- Self-hosted Terraform Enterprise installs require `TFE_ADDRESS` to point
  at the on-prem URL and may need a CA bundle (`TFE_SSL_SKIP_VERIFY` is
  available but should never be set in production).

## See also

- `packages/team-incident-response/mcp-recipes/github-mcp.md` — Terraform
  source lives in GitHub; correlate run failures back to merged PRs.
- `packages/team-incident-response/mcp-recipes/aws-mcp.md` — most HCP
  workspaces apply against AWS; pair with aws-mcp for post-apply drift
  checks.
