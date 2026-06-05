# MCP Recipe — github-mcp

GitHub MCP surfaces repos, PRs, issues, Actions, and code search to opsbench
incident-response agents. Called by the **change-correlator** (recent merges
before incident), **diff-inspector** (Terraform/manifest changes), and
**mitigation-author** (post-incident PRs). Read-only by default; mutation paths
gated through Cedar.

## Source

- Repo: <https://github.com/github/github-mcp-server>
- License: MIT
- Maintainer: GitHub (official) — 30.4k stars

## Install

```bash
# Pre-built binary (recommended for hosts that exec a local command)
curl -L -o /usr/local/bin/github-mcp-server \
  https://github.com/github/github-mcp-server/releases/latest/download/github-mcp-server-linux-amd64
chmod +x /usr/local/bin/github-mcp-server

# OR via Docker
docker pull ghcr.io/github/github-mcp-server:latest
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally avoids built-in MCP. For github-mcp, GitHub already
ships a first-class CLI (`gh`) that covers the same surface area as the MCP
server with sharper ergonomics — Pi should shell out to `gh` directly rather
than wrap the MCP server. For the MCP-only operations (toolset-scoped
read-only mode, `--require-confirmation` mutation gating), wrap the upstream
binary with [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) so Pi
can install it as a skill:

```bash
# Install the gh CLI on the Pi host (covers ~90% of incident-response use)
sudo apt-get install gh   # or: brew install gh
gh auth login

# Install the CLI-Anything wrapper as a Pi skill for the MCP-specific paths
pi install git:github.com/<your-fork>/github-mcp-pi-skill
```

AGENTS.md snippet (place in `~/.pi/agent/AGENTS.md` or project root):

```markdown
## GitHub access

Prefer the `gh` CLI for all read paths (issues, PRs, runs, code search):

- `gh pr list`, `gh pr view <n> --json files,commits`
- `gh run list --workflow=<name>`, `gh run view <id> --log`
- `gh search code 'qs:"GITHUB_TOKEN"' --owner pnats`

For write paths (post-incident PRs), use the wrapped MCP skill which enforces
`--require-confirmation` and a Cedar policy check:

- `github-mcp-skill pr-create --repo <r> --base main --head <branch>`

Never push directly to `main`. Branch protection enforces this server-side.
```

## Configuration — Claude Code (secondary)

Read-only (default for incident correlation):

```jsonc
{
  "mcpServers": {
    "github": {
      "command": "github-mcp-server",
      "args": [
        "stdio",
        "--read-only",
        "--toolsets",
        "repos,issues,pull_requests,actions,code_security"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_INCIDENT_TOKEN}"
      }
    }
  }
}
```

Write (post-incident PR creation, gated):

```jsonc
{
  "mcpServers": {
    "github-write": {
      "command": "github-mcp-server",
      "args": [
        "stdio",
        "--toolsets",
        "repos,pull_requests",
        "--require-confirmation"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_INCIDENT_WRITE_TOKEN}"
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

1. Create a **fine-grained** PAT (not classic) at
   <https://github.com/settings/personal-access-tokens/new>.
2. Read-only token permissions: Repository → Contents (Read), Pull requests
   (Read), Issues (Read), Actions (Read), Metadata (Read). Restrict to the
   specific repos in scope for the incident agent.
3. Separate write token (`github-incident-write-pat`) with Contents (Write) and
   Pull requests (Write) — used only by mitigation-author behind Cedar.
4. Store both tokens in your secret manager (Azure Key Vault / 1Password /
   Vault); never inline into `mcpServers.env`.
5. Verify the read-only token:

   ```bash
   GITHUB_TOKEN=$GITHUB_INCIDENT_TOKEN gh api user -q .login
   # Should print your username; should 403 on `gh api repos/<r>/contents -f message=x`
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `list_pull_requests` / `get_pull_request` | Correlate recent merges to incident window | None (read-only) |
| `list_workflow_runs` / `get_workflow_run_logs` | Inspect failing CI before/after deploy | None (read-only); cap log size |
| `search_code` | Find feature flag / config refs across org | Allowlist org+repo prefixes |
| `list_issues` / `get_issue` | Surface prior reports of same symptom | None (read-only) |
| `create_pull_request` | Author post-incident remediation PR | `Action::"github:createPR"` + human-in-loop |
| `merge_pull_request` | Land remediation | Never agent-driven; require human approver |
| `create_or_update_file` | Edit Terraform/manifests inline | `Action::"github:writeFile"` + repo+path allowlist |

## Safety

- Default to `--read-only`; the flag blocks `create_*`, `update_*`, `delete_*`,
  `merge_*`, and `dispatch_*` on top of PAT-level restrictions.
- The fine-grained PAT enforces repo allowlist server-side — even if the agent
  attempts an out-of-scope repo it 403s.
- Mutations gated through Cedar: `Action::"github:createPR"`,
  `Action::"github:writeFile"`, `Action::"github:mergePR"` (deny by default).
- Branch protection on `main` blocks direct pushes from any PAT — required
  status checks + review still apply to agent-authored PRs.
- Prompt-injection: issue bodies, PR descriptions, and code comments are
  attacker-controlled. Strip or sandbox before letting an agent reason on
  them; never let issue text trigger tool calls without confirmation.

## Caveats

- The `actions` toolset returns full workflow logs — large CI runs saturate
  context. Prefer `get_workflow_run_jobs` + targeted log slices over
  `get_workflow_run_logs`.
- `code_security` toolset requires GitHub Advanced Security on the repo.
- Rate limits apply per-PAT (5000 req/hr for fine-grained). Heavy fan-out
  across many repos can throttle mid-incident — cache aggressively.
- For commit-level Terraform-state correlation, `git log -- terraform/` via
  Bash is faster than the MCP, which exposes commits but not efficient
  path-scoped log queries.
- License is MIT — safe to vendor or fork (no AGPL constraints).

## See also

- `packages/team-incident-response/mcp-recipes/linear-mcp.md` — issue tracking
  for incident write-up follow-ups.
- `packages/team-incident-response/mcp-recipes/slack-mcp.md` — surface PR
  links in the incident channel.
