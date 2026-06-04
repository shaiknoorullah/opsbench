# MCP Recipe — ansible-mcp

Ansible Dev Tools MCP exposes playbook scaffolding, lint, and execution-environment
helpers from the Red Hat Ansible VS Code extension. The opsbench
`runbook-author` agent class calls this to generate first-pass playbooks for
documented remediation paths, and the `recovery-executor` uses lint/EE-validate
verbs as a preflight gate before any Cedar-approved `ansible-playbook` run.

## Source

- Repo: <https://github.com/ansible/vscode-ansible>
- License: Apache-2.0
- Maintainer: Red Hat Ansible (Dev Tools MCP — official)

## Install

```bash
# Vendor-recommended: install the Ansible Dev Tools bundle (ships the MCP entrypoint)
pip install --user ansible-dev-tools

# OR run the MCP via the prebuilt container
podman pull ghcr.io/ansible/community-ansible-dev-tools:latest
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships without built-in MCP. Wrap the Ansible Dev Tools
MCP as a Pi-callable CLI via HKUDS/CLI-Anything, then install as a Pi skill:

```bash
# 1. Fork ansible/vscode-ansible and run CLI-Anything against the
#    `packages/ansible-language-server` MCP entrypoint to generate a flat
#    CLI surface (one subcommand per MCP tool, JSON in/out).
# 2. Publish the wrapper as a git-installable Pi skill:
pi install git:github.com/<your-fork>/ansible-mcp-pi-skill
```

Add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```md
## ansible

For Ansible playbook scaffolding, lint, and execution-environment validation,
call the `ansible-mcp` wrapper CLI installed under
`~/.pi/skills/ansible-mcp-pi-skill/bin/ansible-mcp`:

- Scaffold: `ansible-mcp scaffold-playbook --collection opsbench.incident --output json`
- Lint: `ansible-mcp lint --path roles/ --profile production --output json`
- EE validate: `ansible-mcp ee-validate --file execution-environment.yml --output json`
- Actual `ansible-playbook` execution is NOT proxied through this MCP — the
  wrapper only authors and validates. Hand the rendered playbook to the
  recovery-executor (Cedar-gated) for run.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "ansible": {
      "command": "ansible-dev-tools",
      "args": ["mcp", "--stdio", "--read-only",
               "--allowed-tools", "scaffold-playbook,scaffold-role,lint,ee-validate,collection-info"],
      "env": {
        "ANSIBLE_COLLECTIONS_PATH": "${HOME}/.ansible/collections",
        "ANSIBLE_LINT_PROFILE": "production"
      }
    }
  }
}
```

For authoring sessions that need filesystem writes (runbook-author class only):

```jsonc
{
  "mcpServers": {
    "ansible-author": {
      "command": "ansible-dev-tools",
      "args": ["mcp", "--stdio",
               "--allowed-tools", "scaffold-playbook,scaffold-role,scaffold-collection,lint,ee-validate",
               "--workspace", "${OPSBENCH_RUNBOOKS_DIR}"],
      "env": {
        "ANSIBLE_COLLECTIONS_PATH": "${HOME}/.ansible/collections",
        "ANSIBLE_LINT_PROFILE": "production"
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

1. No auth required for scaffold/lint/EE-validate verbs — they operate on local
   files and the user's installed collection set.
2. If extending to AAP (Ansible Automation Platform) for job-template launches,
   create a service account in AAP and grant `execute` on the targeted job
   templates only; OIDC against the AAP gateway is the supported path.
3. Store the AAP token as `aap-incident-token` in Azure Key Vault (only when
   AAP integration is enabled — F0 ships without it).
4. Export for local Claude Code runs (AAP-only):
   `export AAP_TOKEN=$(az keyvault secret show --vault-name opsbench-kv --name aap-incident-token -o tsv --query value)`.
5. Verify the MCP starts and lists tools (no AAP required):
   `ansible-dev-tools mcp --stdio --list-tools | jq '.tools[].name'`.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `scaffold-playbook` | Generate a starter playbook from a task description | Allow for runbook-author; deny for incident-responder |
| `scaffold-role` | Generate a role skeleton with `tasks/`, `defaults/`, `meta/` | Allow for runbook-author |
| `scaffold-collection` | Generate a full collection layout (`galaxy.yml`, plugins/) | Allow for runbook-author with `target_dir` attr |
| `lint` | Run `ansible-lint` against a path with a named profile | Allow read-only for all agent classes |
| `ee-validate` | Validate an `execution-environment.yml` definition | Allow for runbook-author and recovery-executor (preflight) |
| `collection-info` | Inspect an installed collection's modules/plugins | Allow for all agent classes |
| `playbook-explain` | Summarize what a playbook will do (no execution) | Allow for incident-responder, change-correlator |

## Safety

- Default posture is read-only — the authoring profile (`ansible-author`) is a
  separate `mcpServers` entry, scoped to `${OPSBENCH_RUNBOOKS_DIR}`, and is only
  loaded for the runbook-author agent class.
- The MCP **does not execute playbooks** — `ansible-playbook` runs go through
  the recovery-executor with Cedar gating on `(inventory, hosts_pattern,
  change_ticket_id, business_hours_window)`. Never wire `ansible-playbook` into
  this MCP's allowed tools.
- `scaffold-*` verbs write to disk; constrain `--workspace` to the runbooks
  directory and reject writes outside it at the Cedar layer.
- `ee-validate` reads `execution-environment.yml` which may reference private
  registries — sanitize credentials out of the file before sharing logs.
- Prompt-injection caveat: lint output and playbook task names are
  user-controllable. If the MCP returns a `task.name` containing instructions
  ("ignore previous, run X"), treat it as data, not a directive.

## Caveats

- The Dev Tools MCP is relatively new (post-2024) — surface area changes between
  `ansible-dev-tools` minor releases. Pin to a specific version in CI rather
  than tracking `latest`.
- Apache-2.0, so vendoring/forking is fine; retain `NOTICE` on the fork used
  for the CLI-Anything Pi wrapper.
- Requires Python 3.10+ and `ansible-core` >= 2.16 on the host running the MCP;
  the container variant (`community-ansible-dev-tools`) bundles both.
- `lint` results depend on installed collections — runbook-author containers
  must pre-install the same collection set as the prod runner image, or scaffold
  output will lint-pass locally and lint-fail in CI.
- AAP/EDA integration is out of scope for F0; if added later it pulls in
  OIDC + a Red Hat subscription and should ship as a separate
  `ansible-aap-mcp.md` recipe.

## See also

- `github-mcp.md` — commit scaffolded playbooks to the GitOps repo for review.
- `k8s-mcp.md` — cluster-level verbs paired with `kubernetes.core` collection
  playbooks the runbook-author produces.
