# MCP Recipe — crowdstrike-falcon-mcp

CrowdStrike Falcon EDR MCP. Called by the opsbench `incident-commander`,
`evidence-analyst`, and `threat-hunter` agent classes during incident response to
query detections, enumerate affected hosts, pull host-level telemetry, and (under
explicit Cedar gating) drive Real-Time Response (RTR) sessions and quarantine
actions. Read-only Falcon API scopes are the default; destructive paths (host
containment, RTR command execution, quarantine release) must be opened individually
via the per-agent `tools.cedar` policy.

## Source

- Repo: <https://github.com/CrowdStrike/falcon-mcp>
- License: MIT
- Maintainer: CrowdStrike (official)

## Install

```bash
# Python package (vendor-recommended)
pip install crowdstrike-falcon-mcp

# Or run from source
git clone https://github.com/CrowdStrike/falcon-mcp.git
cd falcon-mcp && pip install -e .
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally does not bundle MCP. Wrap the upstream MCP server as a
Pi-callable CLI via [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything),
then install the generated skill:

```bash
# 1. Generate a Pi skill that shells out to falcon-mcp
cli-anything wrap \
  --source github.com/CrowdStrike/falcon-mcp \
  --binary "$(which falcon-mcp)" \
  --out ./falcon-pi-skill

# 2. Install into Pi
pi install git:github.com/<your-fork>/crowdstrike-falcon-mcp-pi-skill
```

Direct Pi (the agent) to the wrapper with a `~/.pi/agent/AGENTS.md` (or per-project
`SYSTEM.md`) snippet:

```markdown
## CrowdStrike Falcon (EDR)

When triaging an EDR detection, call the `falcon` CLI for detection/host/event
lookups. Default behaviour is read-only (Falcon API key with `Detections:read`,
`Hosts:read`, `Event Streams:read` only).

- List recent detections:        `falcon detections list --since 1h`
- Get detection details:         `falcon detections get <DETECTION_ID>`
- Look up host by hostname:      `falcon hosts search --hostname <name>`
- Enumerate processes on host:   `falcon hosts processes <AID>`
- Search IoCs across hosts:      `falcon iocs search --value <ioc>`

Never invoke `falcon hosts contain|lift-containment`, `falcon rtr session start`,
`falcon rtr execute`, or `falcon quarantine release` unless the user has explicitly
granted write/RTR permission for this session AND a human approval has been logged.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "falcon": {
      "command": "falcon-mcp",
      "args": ["--transport", "stdio", "--read-only"],
      "env": {
        "FALCON_CLIENT_ID":     "${FALCON_CLIENT_ID}",
        "FALCON_CLIENT_SECRET": "${FALCON_CLIENT_SECRET}",
        "FALCON_BASE_URL":      "https://api.crowdstrike.com",
        "FALCON_MEMBER_CID":    "${FALCON_MEMBER_CID}"
      }
    }
  }
}
```

`FALCON_BASE_URL` varies by cloud: `api.crowdstrike.com` (US-1),
`api.us-2.crowdstrike.com` (US-2), `api.eu-1.crowdstrike.com` (EU-1),
`api.laggar.gcw.crowdstrike.com` (GovCloud). Pin the correct one — wrong region
returns 403 with no useful body.

## Configuration — other hosts

Codex CLI, Copilot CLI, Cursor, Gemini, and OpenCode each get a thin adapter under
`tools/<host>-compat-layer/` that translates this recipe's `mcpServers` block into
the host-native config. Adapters ship in **F5**; F0 only documents the pointer.

## Auth setup

1. In Falcon console: **Support and resources → API clients and keys → Create API
   client**. Name it `opsbench-readonly`.
2. Grant the minimum read scopes only: `Detections:read`, `Hosts:read`,
   `Event Streams:read`, `Incidents:read`, `IOCs:read`, `Real Time Response:read`.
   Do **not** grant `Hosts:write`, `Real Time Response Admin:write`, or
   `Quarantined Files:write` for the default service principal.
3. Copy the client ID and secret immediately (the secret is only shown once); store
   them in 1Password or Azure Key Vault:

   ```bash
   export FALCON_CLIENT_ID="$(op read 'op://Private/falcon-opsbench/client-id')"
   export FALCON_CLIENT_SECRET="$(op read 'op://Private/falcon-opsbench/client-secret')"
   ```

4. Verify the credentials resolve and scopes are correct:

   ```bash
   curl -s -X POST "$FALCON_BASE_URL/oauth2/token" \
     -d "client_id=$FALCON_CLIENT_ID&client_secret=$FALCON_CLIENT_SECRET" \
     | jq '.access_token' \
     && falcon-mcp --self-test --read-only
   # Self-test should enumerate only read tools — zero write/RTR tools present.
   ```

5. For destructive operations, provision a **separate** API client
   (`opsbench-response`) with write scopes and load it only inside a Cedar-gated,
   human-approved session — never into the default agent env.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| ---- | ------- | ------------------------ |
| `detections_search` | Query detections by time/severity/host/tactic | Open by default |
| `detections_get` | Fetch full detection detail, behaviors, IoCs | Open by default |
| `hosts_search` | Look up hosts by AID, hostname, IP, MAC | Open by default |
| `hosts_get_processes` | Enumerate running processes on a host | Open by default |
| `incidents_search` | Query Falcon incident records | Open by default |
| `hosts_contain` | Network-isolate a host (network containment) | **Closed** — `incident-commander` only, human-approval required |
| `rtr_session_start` + `rtr_execute` | Real-Time Response shell on a host | **Closed** — `incident-commander` only, human-approval + audit |
| `quarantine_release` | Release a quarantined file | **Closed** — never auto-approved |

(See upstream [`README.md`](https://github.com/CrowdStrike/falcon-mcp) for the full
20+ tool reference across Detections, Hosts, Incidents, IoCs, RTR, Quarantine,
Spotlight, and Discover modules.)

## Safety

- **Read-only by default.** Ship the `--read-only` flag and a credentials env that
  carries only `*:read` scopes; promoting to a write-capable client must be a
  deliberate, reviewed change with a separate audit trail.
- Cedar policy `packages/team-incident-response/policies/tools.cedar` denies
  `hosts_contain`, `rtr_*`, and `quarantine_release` for every agent class except
  `incident-commander`, and even there gates them behind `human-approval` plus a
  signed runbook reference.
- **Treat detection metadata as untrusted input.** Process command lines, file
  paths, and detection descriptions can carry attacker-controlled strings that
  attempt prompt injection — sanitize/escape before feeding to other tools.
- RTR sessions execute arbitrary commands on production endpoints; never allow an
  agent to assemble an RTR command line from raw detection content without a
  human-readable preview and explicit approval.
- Host containment is reversible but disruptive (cuts the host off the network);
  always pair `hosts_contain` with a follow-up reminder for `lift_containment`.
- Log every Falcon API call (request, response status, latency) to the opsbench
  audit sink — Falcon's own audit log lags by minutes.

## Caveats

- **CrowdStrike Falcon subscription required.** No free tier; the MCP is useless
  without a paying Falcon tenant and provisioned API client.
- Falcon's API rate limits are tenant-wide (default ~6000 req/min, varies by
  module); aggressive multi-agent enumeration can throttle legitimate console
  users. Add per-tool concurrency caps in opsbench's MCP proxy.
- The `member_cid` parameter is required for MSSP/Flight Control parent tenants —
  omit for single-tenant deployments or you'll hit "invalid CID" 400s.
- Real-Time Response requires the Falcon RTR feature SKU; tools surface but return
  402/403 if the tenant lacks it.
- Region pinning is mandatory — see `FALCON_BASE_URL` note above. Wrong region =
  silent 403, not a redirect.
- MIT-licensed and CrowdStrike-maintained, so vendoring is permitted, but pin to
  a tagged release; the MCP surface is still evolving and tool names have changed
  between minor versions.
- Prompt-injection vectors via detection content are a documented research area
  for EDR-connected agents; default to read-only and never let the agent execute
  RTR commands derived from untrusted strings.

## See also

- [thehive-mcp](./thehive-mcp.md) — open Falcon detections as TheHive cases for
  cross-team incident tracking.
- [opencti-mcp](./opencti-mcp.md) — enrich Falcon IoCs (hashes, domains, IPs)
  with threat-intel context before deciding on containment.
- [pagerduty-mcp](./pagerduty-mcp.md) — page the on-call when a high-severity
  Falcon detection lands outside business hours.
