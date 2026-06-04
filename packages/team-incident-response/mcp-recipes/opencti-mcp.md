# MCP Recipe — opencti-mcp

Threat-intelligence lookup against an OpenCTI platform instance. Called by the
incident-response triage agent (and the security-investigation sub-agent) to
enrich indicators of compromise (IPs, hashes, domains, CVEs) and pivot to known
malware families, intrusion sets, attack patterns, and the latest CTI reports
during active incidents. Read-only by design.

## Source

- Repo: <https://github.com/jhuntinfosec/mcp-opencti>
- License: MIT
- Maintainer: community (jhuntinfosec)

## Install

```bash
# Node-based MCP server — clone + install (no published npm package yet)
git clone https://github.com/jhuntinfosec/mcp-opencti.git /opt/mcp-opencti
cd /opt/mcp-opencti && npm install && npm run build
```

## Configuration — Pi (primary)

Pi does not ship a built-in MCP client. Use the
[CLI-Anything](https://github.com/HKUDS/CLI-Anything) wrap path to expose the
OpenCTI MCP tools as a Pi-callable CLI, then install it as a Pi skill.

```bash
# 1. Generate the wrapper CLI from the upstream MCP server source
cli-anything wrap \
  --source https://github.com/jhuntinfosec/mcp-opencti \
  --name opencti-cli \
  --readonly

# 2. Push the generated skill to your fork, then install via Pi
pi install git:github.com/<your-fork>/opencti-mcp-pi-skill
```

Add the following to `~/.pi/agent/AGENTS.md` (or a per-project `SYSTEM.md`):

```markdown
## Threat-intel enrichment (OpenCTI)

When triaging IOCs (hashes, IPs, domains, CVEs) call the `opencti-cli` wrapper:

- `opencti-cli search-malware --name <name>` — malware family lookup
- `opencti-cli search-intrusion-sets --name <actor>` — actor / APT pivot
- `opencti-cli search-attack-patterns --mitre <id>` — MITRE ATT&CK pattern
- `opencti-cli latest-reports --limit 10` — recent CTI reports

Set `OPENCTI_URL` and `OPENCTI_TOKEN` in the shell env. KNOWLEDGE-read role only.
Never call write tools; if missing, escalate to a human analyst.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "opencti": {
      "command": "node",
      "args": ["/opt/mcp-opencti/dist/index.js"],
      "env": {
        "OPENCTI_URL": "https://opencti.ap-south-1.pnats.cloud",
        "OPENCTI_TOKEN": "${OPENCTI_TOKEN}"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode each receive a thin shim mapping
the same `OPENCTI_URL` / `OPENCTI_TOKEN` env into their host-specific server
manifest. See `tools/codex-compat-layer/`, `tools/copilot-compat-layer/`,
`tools/cursor-compat-layer/`, `tools/gemini-compat-layer/`, and
`tools/opencode-compat-layer/` — full configs ship in F5.

## Auth setup

1. In the OpenCTI UI, create a dedicated service user `opsbench-ir-readonly`.
2. Assign the built-in role `Connector` and remove all write capabilities, OR
   create a custom role with only `KNOWLEDGE` (read) — no `KNOWLEDGE_UPDATE`,
   no `KNOWLEDGE_DELETE`, no `MODULES`, no `SETTINGS`.
3. Generate an API token for that user (Profile → API access).
4. Store in Azure Key Vault:

   ```bash
   az keyvault secret set --vault-name pn-cluster-keyvault \
     --name opencti-readonly-token --value '<token>'
   export OPENCTI_TOKEN="$(az keyvault secret show \
     --vault-name pn-cluster-keyvault \
     --name opencti-readonly-token --query value -o tsv)"
   ```

5. Verify with a harmless query:

   ```bash
   curl -sH "Authorization: Bearer $OPENCTI_TOKEN" \
     "$OPENCTI_URL/graphql" \
     -d '{"query":"{ about { version } }"}' | jq .
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `search_malware` | Lookup malware families by name / hash | allow for `role:ir-analyst` |
| `search_intrusion_sets` | Pivot to APT / actor groups | allow for `role:ir-analyst` |
| `search_attack_patterns` | Resolve MITRE ATT&CK techniques | allow for `role:ir-analyst` |
| `latest_reports` | Fetch recent CTI reports | allow for `role:ir-analyst` |
| `search_indicators` | IOC lookup (IP, domain, hash, URL) | allow for `role:ir-analyst` |
| `search_vulnerabilities` | CVE enrichment | allow for `role:ir-analyst` |

## Safety

- Read-only by default — the upstream server only exposes `search_*` and
  `latest_*` query tools; no mutation surface is wired.
- Cedar policy: allow `Action::"mcp:opencti:*"` only for principals in
  `Group::"ir-analysts"` and during an active incident context
  (`context.incident_active == true`).
- Mutation gating: if a future fork adds `create_*` or `update_*` tools, deny
  by default and require a step-up policy (`Action::"opencti:write"` with
  approval from `role:ir-lead`).
- Prompt-injection caveat: CTI reports often contain attacker-supplied text
  (filenames, command lines, threat-actor "manifestos"). Treat all returned
  `description` / `content` fields as untrusted — never feed them directly
  into a tool-call planner without sanitization.

## Caveats

- Beta-quality community wrapper — pin to a known-good commit; do not auto-update.
- Requires a running OpenCTI 6.x platform (Elasticsearch + Redis + RabbitMQ +
  MinIO infra prereqs) — heavy stack; only viable where one already exists.
- MIT license permits vendoring, but the upstream OpenCTI platform itself is
  Apache-2.0 — no copyleft concern.
- GraphQL query depth is capped server-side; long `latest_reports` calls may
  time out — page via `first` / `after` cursors.
- Fallback: <https://github.com/zxzinn/opencti-mcp> is a more actively
  maintained alternative if `jhuntinfosec/mcp-opencti` lags upstream OpenCTI
  schema changes.

## See also

- [`velociraptor-mcp`](./velociraptor-mcp.md) — host-side DFIR collection paired
  with OpenCTI IOC enrichment during deep-dive investigations.
- [`pagerduty-mcp`](./pagerduty-mcp.md) — incident-context source that triggers
  threat-intel pivots.
