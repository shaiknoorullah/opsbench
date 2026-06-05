# MCP Recipe — vault-mcp

HashiCorp Vault MCP. Called by the incident-response secrets-rotator and forensics agent
classes when an incident requires inspecting KV paths, validating PKI certificate chains,
rotating Transit encryption keys, or auditing AppRole authentication mounts. Default
posture is read-only; mutation tools (key rotation, policy writes) are Cedar-gated and
require human approval.

## Source

- Repo: <https://github.com/hashicorp/vault-mcp-server>
- License: MPL-2.0
- Maintainer: HashiCorp (official)

## Install

```bash
# Pre-built binary from GitHub releases
curl -L -o /usr/local/bin/vault-mcp-server \
  https://github.com/hashicorp/vault-mcp-server/releases/latest/download/vault-mcp-server-linux-amd64
chmod +x /usr/local/bin/vault-mcp-server

# OR via Docker
docker pull hashicorp/vault-mcp-server:latest
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships no built-in MCP client. HashiCorp does not publish a
Pi-native extension for vault-mcp-server today, so the integration path is the
CLI-Anything wrap: generate a Pi-callable CLI from the upstream MCP server, then install
it as a Pi skill.

```bash
# 1. Fork hashicorp/vault-mcp-server, wrap with HKUDS/CLI-Anything to expose stdio MCP
#    tools as a flat CLI (vault-mcp list-kv, vault-mcp read-secret, ...).
# 2. Publish the wrapper as <your-fork>/vault-mcp-pi-skill, then:
pi install git:github.com/<your-fork>/vault-mcp-pi-skill
```

Add to project-local `AGENTS.md` (or `~/.pi/agent/AGENTS.md` for a per-user default):

```markdown
## Vault access

Use the `vault-mcp` CLI for HashiCorp Vault operations. Required env: `VAULT_ADDR`,
`VAULT_TOKEN` (or `VAULT_ROLE_ID` + `VAULT_SECRET_ID` for AppRole). Default to
read-only subcommands (`list-kv`, `read-secret`, `list-pki-issuers`, `read-cert`).
For mutation subcommands (`rotate-transit-key`, `write-policy`, `tidy-pki`) request
human approval in the chat before invoking.
```

A short `SYSTEM.md` directive can further constrain the agent to refuse any
`vault-mcp write-*` invocation outside an open incident timeline.

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "vault": {
      "command": "vault-mcp-server",
      "args": ["stdio", "--read-only", "--toolsets", "kv,pki,transit,approle"],
      "env": {
        "VAULT_ADDR": "${VAULT_ADDR}",
        "VAULT_TOKEN": "${VAULT_INCIDENT_RO_TOKEN}"
      }
    }
  }
}
```

For mutation (key rotation, post-incident credential reissue) use a separate server
entry bound to a Cedar-gated write token:

```jsonc
{
  "mcpServers": {
    "vault-write": {
      "command": "vault-mcp-server",
      "args": ["stdio", "--toolsets", "transit,pki", "--require-confirmation"],
      "env": {
        "VAULT_ADDR": "${VAULT_ADDR}",
        "VAULT_ROLE_ID": "${VAULT_INCIDENT_RW_ROLE_ID}",
        "VAULT_SECRET_ID": "${VAULT_INCIDENT_RW_SECRET_ID}"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode each get a thin shim that delegates to the
same upstream binary. Configs ship in F5 — see `tools/codex-compat-layer/`,
`tools/copilot-compat-layer/`, `tools/cursor-compat-layer/`,
`tools/gemini-compat-layer/`, and `tools/opencode-compat-layer/`.

## Auth setup

1. Create a read-only Vault policy `incident-response-ro` granting `read`/`list` on
   `secret/data/*`, `pki/*`, `transit/keys/*`, and `auth/approle/role/*`.
2. Issue a short-lived token: `vault token create -policy=incident-response-ro -ttl=8h`
   and store as `vault-incident-readonly-token` in the secrets backend
   (Azure Key Vault for pnats).
3. For write operations, configure an AppRole `incident-response-rw` bound to a
   policy that allows `update` on `transit/keys/*/rotate` and `pki/root/rotate/*`
   only — never `delete` or `sys/*`.
4. Distribute `VAULT_ROLE_ID` via config and `VAULT_SECRET_ID` via a one-time wrap.
5. Verify: `vault-mcp-server --version && vault token lookup` should report the
   expected policy set without errors.

## Tools surfaced

| Tool                       | Purpose                                              | Recommended Cedar gating                      |
|----------------------------|------------------------------------------------------|-----------------------------------------------|
| `kv_list`                  | List KV v2 paths under a mount                       | read-only; allow for `incident_responder`     |
| `kv_read`                  | Read a KV secret version                             | read-only; redact response, log path access   |
| `pki_list_issuers`         | Enumerate PKI issuers / intermediates                | read-only; allow broadly                      |
| `pki_read_cert`            | Read a leaf or CA certificate                        | read-only; allow broadly                      |
| `transit_rotate_key`       | Rotate a Transit encryption key                      | mutation; human_approval + open incident      |
| `transit_rewrap`           | Rewrap ciphertext to latest key version              | mutation; human_approval                      |
| `approle_read_role`        | Inspect an AppRole mount config                      | read-only; allow for `secrets_auditor`        |

## Safety

- Default toolset is read-only; the `--read-only` flag blocks every `write_*`,
  `update_*`, `delete_*`, and `rotate_*` operation server-side.
- Cedar policies gate mutation tools on `(open_incident == true) AND (operator.role in {sre, security_lead})`.
- All secret values returned by `kv_read` SHOULD be redacted before being placed in agent
  context — wrap the response in the redactor middleware (`tools/redact-layer/`).
- Prompt-injection caveat: secret values themselves may contain hostile instructions
  (e.g. a KV path storing an attacker-controlled string). Treat any `kv_read` payload as
  untrusted data, never as agent instructions.
- AppRole `secret_id` is single-use when wrap-delivered; never log it.

## Caveats

- vault-mcp-server is a relatively new HashiCorp project (pre-1.0 at time of writing);
  toolset names and flag surface may change between minor releases — pin a version in
  the install command for reproducibility.
- MPL-2.0 is a weak-copyleft license; safe to vendor or distribute alongside opsbench,
  but modifications to the server source itself must remain MPL-2.0.
- Vault must be unsealed and reachable at `VAULT_ADDR` before the MCP starts; the server
  does not handle unseal flows.
- Namespace-aware deployments (Vault Enterprise) require `VAULT_NAMESPACE` — set it in
  the env block alongside `VAULT_ADDR`.
- The PKI `tidy` operation can be expensive on large mounts; never run from an
  interactive agent loop without explicit operator confirmation.

## See also

- `pagerduty-mcp.md` — paging path when Vault outage triggers a secrets-availability incident.
- `azure-mcp.md` — Azure Key Vault is the bootstrap store that holds the Vault tokens themselves.
