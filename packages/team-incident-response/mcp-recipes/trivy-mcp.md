# MCP Recipe — trivy-mcp

Trivy MCP surfaces filesystem, container image, and git-repository CVE scans to
opsbench incident-response agents. Called by the **vuln-correlator** (was this
incident caused by a known-CVE workload?), the **supply-chain-auditor** (did a
fresh image introduce a regression in the deploy window?), and the
**mitigation-author** (what's the minimum bump to clear the finding?). Bundled
with Trivy >=0.55, so `trivy mcp serve` is the install — no separate binary.

## Source

- Repo: <https://github.com/aquasecurity/trivy-mcp>
- License: MIT
- Maintainer: Aqua Security (official) — same team as Trivy itself

## Install

```bash
# Trivy >=0.55 ships the MCP subcommand in-tree
# Linux: official install script
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
  | sh -s -- -b /usr/local/bin v0.55.0

# Verify the MCP subcommand is present
trivy mcp --help

# Refresh the vulnerability DB before first use (and on a cron thereafter)
trivy image --download-db-only
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally avoids built-in MCP. For trivy-mcp, the Trivy CLI is
already the canonical surface — `trivy fs`, `trivy image`, and `trivy repo`
produce the same JSON the MCP server returns, with sharper exit codes and no
long-lived process. Pi should shell out to `trivy` directly for most scans.
For the MCP-specific paths (server-mode DB caching across many scans, the
`--format mcp` streaming output), wrap the upstream binary with
[HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) so Pi can install
it as a skill:

```bash
# Plain Trivy CLI on the Pi host (covers ~90% of incident triage)
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
  | sh -s -- -b /usr/local/bin v0.55.0

# CLI-Anything wrapper as a Pi skill for the MCP-specific paths
pi install git:github.com/<your-fork>/trivy-mcp-pi-skill
```

AGENTS.md snippet (place in `~/.pi/agent/AGENTS.md` or project root):

```markdown
## Vulnerability scanning (Trivy)

Prefer the bare `trivy` CLI for one-shot scans during triage:

- `trivy fs --severity HIGH,CRITICAL --format json /path/to/workload`
- `trivy image --severity HIGH,CRITICAL --format json <image>:<tag>`
- `trivy repo --severity HIGH,CRITICAL https://github.com/<owner>/<repo>`

For multi-image batch sweeps (>5 images) or when feeding results back into a
correlator, use the wrapped MCP skill — it keeps the DB warm across calls and
emits the structured tool-call output the agent expects:

- `trivy-mcp-skill scan-batch --input images.txt --severity HIGH,CRITICAL`

Never run scans against external registries you don't control without first
checking the registry's `docker config` is read-only.
```

## Configuration — Claude Code (secondary)

Read-only (default — Trivy is read-only by nature, but the MCP server still
accepts mutating subcommands like DB updates):

```jsonc
{
  "mcpServers": {
    "trivy": {
      "command": "trivy",
      "args": [
        "mcp",
        "serve",
        "--severity", "HIGH,CRITICAL",
        "--cache-dir", "/var/cache/trivy",
        "--skip-db-update"
      ],
      "env": {
        "TRIVY_NO_PROGRESS": "true",
        "DOCKER_CONFIG": "/etc/opsbench/docker-readonly"
      }
    }
  }
}
```

DB-update variant (run on a schedule, not from the incident agent):

```jsonc
{
  "mcpServers": {
    "trivy-dbupdate": {
      "command": "trivy",
      "args": ["mcp", "serve", "--download-db-only"],
      "env": {
        "TRIVY_CACHE_DIR": "/var/cache/trivy"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini CLI, and OpenCode each need a thin shim that
maps their host-native tool config onto either the upstream `trivy mcp serve`
command or the CLI-Anything wrapper above. Full host configs ship in **F5**
under `tools/codex-compat-layer/`, `tools/copilot-compat-layer/`,
`tools/cursor-compat-layer/`, `tools/gemini-compat-layer/`, and
`tools/opencode-compat-layer/`.

## Auth setup

1. **Filesystem and repo scans require no auth** — Trivy reads local files and
   clones public repos with the host's git credentials.
2. **Image scans against private registries** need a docker config. Generate a
   read-only one: `docker --config /etc/opsbench/docker-readonly login <registry>`
   using a pull-only robot account (no push, no delete).
3. **Vulnerability DB**: Trivy pulls the OCI-packaged DB from
   `ghcr.io/aquasecurity/trivy-db`. If your environment blocks ghcr.io, mirror
   the DB internally and set `TRIVY_DB_REPOSITORY` to the mirror.
4. **Refresh the DB on a cron** (every 6h is the upstream default cadence) and
   point the MCP server at the warmed cache with `--skip-db-update` so incident
   scans don't block on a network fetch.
5. Verify the read-only token and DB freshness:

   ```bash
   DOCKER_CONFIG=/etc/opsbench/docker-readonly \
     trivy image --severity HIGH,CRITICAL --no-progress \
     <private-registry>/<repo>:<tag>
   # Should produce JSON; should fail closed if the token has push scope
   trivy --cache-dir /var/cache/trivy version --format json | jq .VulnerabilityDB
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `scan_filesystem` | Find CVEs and misconfigs in a local checkout | None (read-only) |
| `scan_image` | Pull and scan a container image for CVEs | Allowlist registry hostnames |
| `scan_repository` | Clone and scan a remote git repo | Allowlist owner/org prefixes |
| `scan_sbom` | Re-evaluate a stored SBOM against the current DB | None (read-only) |
| `list_vulnerabilities` | Query CVE details from the warm DB | None (read-only) |
| `generate_sbom` | Emit CycloneDX/SPDX for an artifact | `Action::"trivy:writeSBOM"` if writing to shared store |
| `update_db` | Refresh the vulnerability database | Schedule-only; deny from agents |

## Safety

- Trivy is read-only against its targets — it never mutates the scanned
  filesystem, image, or repo. The only mutating subcommand is `--download-db-only`,
  which writes to the cache dir; gate it behind `Action::"trivy:updateDB"` and
  deny by default from incident agents.
- Cedar: deny `Action::"trivy:scanImage"` for any registry hostname outside
  the org's allowlist — agent-supplied image refs are a prompt-injection vector
  (an attacker who controls an issue body can ask the agent to "scan
  evil.example.com/payload:latest" and exfiltrate via the registry pull).
- Cap `--severity` to `HIGH,CRITICAL` by default. LOW/MEDIUM floods context
  and rarely actionable inside a 30-minute incident window.
- Image scans pull layers — bound `--timeout` (default 5m) and `--cache-dir`
  size; an attacker-supplied image with thousands of large layers can DoS the
  scanner.
- SBOM outputs may include filesystem paths from the build host; treat them
  as semi-sensitive and never publish to public channels without redaction.

## Caveats

- The MCP subcommand is **bundled with Trivy >=0.55** — on older Trivy
  installs you must upgrade the whole binary, not pull a separate package.
- Vulnerability DB lag: Trivy's DB is rebuilt every 6h upstream. For a CVE
  published in the last few hours, cross-check against the GitHub Security
  Advisory feed (via github-mcp) before declaring an image clean.
- License scanning (`--scanners license`) emits per-package SPDX IDs but does
  not enforce policy — pair with a policy-as-code layer (OPA, Conftest) for
  gating.
- Misconfig scanning covers Dockerfile, Kubernetes, Terraform, and Helm — for
  Kubernetes runtime posture, prefer a dedicated kube-bench/kube-hunter MCP.
- License is MIT — safe to vendor or fork (no AGPL constraints).

## See also

- `packages/team-incident-response/mcp-recipes/github-mcp.md` — cross-ref CVE
  findings against recent merges and dependency bumps.
- `packages/team-incident-response/mcp-recipes/k8s-mcp.md` — pivot from a
  vulnerable image to the pods currently running it.
