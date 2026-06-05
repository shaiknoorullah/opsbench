# MCP Recipe — docker-mcp

Docker MCP Gateway surfaces container, image, network, and volume controls to
opsbench incident-response agents, and (uniquely) lets the agent run *other*
MCP servers as isolated sidecar containers. Called by the
**container-forensicist** (inspect a misbehaving container's logs, env, mounts),
the **sidecar-supervisor** (spawn ephemeral MCP servers in jails), and the
**recovery-executor** (restart unhealthy services). Read-only by default;
container/image mutations gated through Cedar.

## Source

- Repo: <https://github.com/docker/mcp-gateway>
- License: MIT (Apache-2.0 on some sub-packages)
- Maintainer: Docker Inc. (official)

## Install

```bash
# Docker Desktop 4.40+ ships the MCP Gateway as a built-in plugin
docker mcp gateway --help

# Standalone install (Linux hosts without Docker Desktop)
curl -L -o /usr/local/lib/docker/cli-plugins/docker-mcp \
  https://github.com/docker/mcp-gateway/releases/latest/download/docker-mcp-linux-amd64
chmod +x /usr/local/lib/docker/cli-plugins/docker-mcp
docker mcp version
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally avoids built-in MCP. For docker-mcp, the host
already exposes the `docker` CLI which covers ~95% of incident-response
container inspection use — Pi should shell out to `docker` directly. The
MCP-Gateway-specific value (spawning *other* MCP servers as ephemeral
containers, gateway-managed lifecycle) is wrapped via
[HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) so Pi can install
it as a skill:

```bash
# Plain docker CLI covers logs, ps, inspect, exec, restart
sudo apt-get install docker-ce-cli   # or: brew install docker
sudo usermod -aG docker $USER && newgrp docker

# Install the CLI-Anything wrapper as a Pi skill for the gateway paths
pi install git:github.com/<your-fork>/docker-mcp-pi-skill
```

AGENTS.md snippet (place in `~/.pi/agent/AGENTS.md` or project root):

```markdown
## Docker access

Prefer the `docker` CLI for read paths (inspecting failed containers):

- `docker ps -a --filter status=exited`
- `docker logs --tail 500 --timestamps <id>`
- `docker inspect <id> --format '{{json .State}}'`
- `docker stats --no-stream <id>`

For spawning ephemeral MCP-server sidecars (e.g. scratch clickhouse-mcp jail),
use the wrapped gateway skill which enforces Cedar policy and a sandboxed
network namespace:

- `docker-mcp-skill server enable <name>` (gated)
- `docker-mcp-skill server disable <name>`

Never run `docker rm -f`, `docker system prune`, or mount the host `/` into a
container. The wrapper denies these by default.
```

## Configuration — Claude Code (secondary)

Read-only (default for container forensics):

```jsonc
{
  "mcpServers": {
    "docker": {
      "command": "docker",
      "args": [
        "mcp",
        "gateway",
        "run",
        "--read-only",
        "--allowed-actions",
        "ps,logs,inspect,stats,events,images,networks,volumes"
      ],
      "env": {
        "DOCKER_HOST": "unix:///var/run/docker.sock"
      }
    }
  }
}
```

Write (recovery-executor only — restart/recreate, gated):

```jsonc
{
  "mcpServers": {
    "docker-write": {
      "command": "docker",
      "args": [
        "mcp",
        "gateway",
        "run",
        "--allowed-actions",
        "ps,logs,inspect,restart,start,stop,server-enable,server-disable",
        "--deny-host-mounts",
        "--require-confirmation"
      ],
      "env": {
        "DOCKER_HOST": "unix:///var/run/docker.sock"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini CLI, and OpenCode each need a thin shim that
maps their host-native tool config onto either the `docker mcp gateway`
plugin or the CLI-Anything wrapper above. Full host configs ship in **F5**
under `tools/codex-compat-layer/`, `tools/copilot-compat-layer/`,
`tools/cursor-compat-layer/`, `tools/gemini-compat-layer/`, and
`tools/opencode-compat-layer/`.

## Auth setup

1. Confirm the agent's Unix user is in the `docker` group (controls socket
   access): `id $USER | grep docker`.
2. For remote daemons, generate mTLS certs per
   <https://docs.docker.com/engine/security/protect-access/> and export
   `DOCKER_HOST=tcp://<host>:2376`, `DOCKER_TLS_VERIFY=1`,
   `DOCKER_CERT_PATH=/etc/docker/certs`.
3. Do **not** mount `/var/run/docker.sock` into the agent's own container
   without a socket-proxy ([Tecnativa/docker-socket-proxy] or
   [BretFisher/docker-socket-proxy]) limiting verbs to the read-only set.
4. Store remote-daemon certs in your secret manager (Azure Key Vault /
   1Password / Vault); never bind-mount the host cert directory into the
   agent.
5. Verify the socket is reachable and the gateway responds:

   ```bash
   docker version --format '{{.Server.Version}}'
   docker mcp gateway run --dry-run --allowed-actions ps,logs
   # Should print a tool-list manifest, not error
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `container_list` / `container_inspect` | Enumerate + describe running/exited containers | None (read-only) |
| `container_logs` | Pull tail of stdout/stderr for a failed container | None (read-only); cap tail size |
| `container_stats` | Live CPU/mem/IO for hot containers | None (read-only) |
| `container_restart` / `container_stop` | Bounce a wedged service | `Action::"docker:restart"` + container-name allowlist |
| `image_list` / `image_inspect` | Identify drift between deployed tag and registry | None (read-only) |
| `server_enable` / `server_disable` | Spawn or tear down an MCP-server sidecar container | `Action::"docker:spawnSidecar"` + image allowlist |
| `volume_list` / `network_list` | Map storage and bridge topology during forensics | None (read-only) |

## Safety

- Default to `--read-only`; the flag blocks `*_create`, `*_remove`, `exec`,
  `prune`, `image_pull`, and host-mount paths.
- `--deny-host-mounts` rejects any spawn request that bind-mounts `/`,
  `/var/run/docker.sock`, `/etc`, `/root`, or `/home` into a sidecar — this
  is the primary container-escape vector.
- Mutations gated through Cedar: `Action::"docker:restart"`,
  `Action::"docker:spawnSidecar"`, `Action::"docker:stop"`, with explicit
  deny on `docker:exec`, `docker:remove`, `docker:prune`.
- Use a socket-proxy in front of the daemon when the agent runs inside its
  own container — direct `docker.sock` access is equivalent to root on host.
- Prompt-injection: container logs, image labels, and `ENV` values are
  attacker-controlled (especially for images pulled at runtime). Never let
  log content trigger tool calls; redact known secret patterns before
  feeding logs back to the model.
- The `server_enable` action launches arbitrary upstream MCP images — gate
  by image-digest allowlist, not tag (tags are mutable).

## Caveats

- Requires Docker Engine 24.0+ and Docker Desktop 4.40+ for the bundled
  gateway plugin; standalone binary works on older daemons but lacks the
  built-in catalog of curated MCP server images.
- `server_enable` pulls images from Docker Hub by default — air-gapped
  deployments must point `--catalog` at a private registry mirror.
- The gateway's "secrets" feature stores credentials in Docker Desktop's
  keychain on macOS / DPAPI on Windows / libsecret on Linux; on headless
  Linux hosts without libsecret, secrets fall back to plaintext on disk —
  verify before relying on it for incident-grade creds.
- Beta status on some sub-features (the OAuth flow for hosted MCP servers,
  the `docker mcp catalog` import path) — pin to a release tag, not
  `latest`, for reproducible incident replay.
- License is MIT — safe to vendor or fork (no AGPL constraints).
- Daemon socket access carries full host-root equivalence; treat the
  read/write split as defense-in-depth, not a security boundary.

## See also

- `packages/team-incident-response/mcp-recipes/k8s-mcp.md` — for
  Kubernetes-native container workloads (prefer over docker-mcp inside a
  cluster).
- `packages/team-incident-response/mcp-recipes/CUSTOM-longhorn-mcp.md` —
  storage layer beneath containerized stateful services.
