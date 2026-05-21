# MCP Recipe — github-mcp

GitHub MCP. Used for: change correlation (recent merges before incident), Terraform
diff inspection, PR creation for post-incident remediations.

## Source

- Repo: https://github.com/github/github-mcp-server
- License: MIT
- Maintainer: GitHub (official)

## Install

```bash
# Pre-built binary
curl -L -o /usr/local/bin/github-mcp-server \
  https://github.com/github/github-mcp-server/releases/latest/download/github-mcp-server-linux-amd64
chmod +x /usr/local/bin/github-mcp-server

# OR via Docker
docker pull ghcr.io/github/github-mcp-server:latest
```

## Configuration

```jsonc
{
  "mcpServers": {
    "github": {
      "command": "github-mcp-server",
      "args": ["stdio", "--read-only", "--toolsets", "repos,issues,pull_requests,actions"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_INCIDENT_TOKEN}"
      }
    }
  }
}
```

For write (post-incident PR creation):

```jsonc
{
  "mcpServers": {
    "github-write": {
      "command": "github-mcp-server",
      "args": ["stdio", "--toolsets", "repos,pull_requests", "--require-confirmation"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_INCIDENT_WRITE_TOKEN}" }
    }
  }
}
```

## Auth setup

1. Create a fine-grained PAT (NOT classic) at https://github.com/settings/personal-access-tokens.
2. Permissions (read-only token):
   - Repository → Contents: Read-only
   - Repository → Pull requests: Read-only
   - Repository → Issues: Read-only
   - Repository → Actions: Read-only
3. Restrict to the specific repos: `ovh`, `pn-cluster-ap-south-1`, `pnats-infra`.
4. Store: `github-incident-readonly-pat` in Azure Key Vault.
5. Separate write-PAT (`github-incident-write-pat`) for post-incident PRs only —
   used by mitigation-author with Cedar gating.

## Read-only verification

`--read-only` blocks: `create_*`, `update_*`, `delete_*`, `merge_*`, `dispatch_*`.
Plus the fine-grained PAT itself rejects writes at the API layer.

## Caveats

- The `actions` toolset includes workflow run logs — large CI logs can saturate context;
  prefer `get_workflow_run_jobs` + targeted log slices over full logs.
- Branch protection on `main` blocks even authorized PATs from direct pushes — that's
  intentional. Post-incident changes always go through PR.
- For Terraform-state correlation, use `git log -- terraform/` via Bash, NOT the MCP —
  the MCP doesn't surface commit-level diffs efficiently.
