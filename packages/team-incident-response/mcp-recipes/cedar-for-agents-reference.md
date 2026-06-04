# MCP Recipe — cedar-for-agents-reference

Reference pointer to the upstream Cedar-for-Agents authorization library
(`cedar-policy/cedar-for-agents`) used by every opsbench agent class as the
**policy gate** before any MCP tool call. This is a **reference recipe** — not
an MCP server end-users install. The actual integration ships in F1 as the
opsbench `cedar-broker` sidecar; this file exists so other recipes can link
their "Recommended Cedar gating" column to a single canonical doc.

## Source

- Repo: <https://github.com/cedar-policy/cedar-for-agents>
- License: Apache-2.0 (verify upstream at pin time)
- Maintainer: AWS Cedar team (verify upstream)

## Install

```bash
# Reference only — opsbench consumes Cedar via the F1 cedar-broker sidecar,
# not by installing the library directly. For local exploration:
cargo install cedar-policy-cli
cedar --version
```

## Configuration — Pi (primary)

Cedar-for-Agents is a Rust library, not an MCP server and not a CLI Pi can call
directly. opsbench wraps it with the standard CLI-Anything path so Pi can
evaluate Cedar policies via shell-out from any skill:

```bash
pi install git:github.com/opsbench/cedar-for-agents-pi-skill
```

AGENTS.md snippet — direct Pi to gate every MCP/tool call through the wrapper
before invocation:

```markdown
## Tool: cedar-gate

Before calling ANY MCP tool or destructive Bash command, evaluate the request
against the active Cedar policy set:

  cedar-gate check \
    --principal "agent::${OPSBENCH_AGENT_CLASS}" \
    --action "${TOOL_NAMESPACE}::${TOOL_NAME}" \
    --resource "${TARGET_RESOURCE_URN}" \
    --json

If stdout returns `{"decision":"Allow"}`, proceed. If `Deny` or `NoDecision`,
refuse the action and surface the diagnostics to the user. Never bypass the
gate, even on retries.
```

For host-level enforcement (so the agent cannot forget), pair the skill with
the `opsbench-pi-hooks` package which registers a `pre-tool` hook that runs
`cedar-gate` automatically.

## Configuration — Claude Code (secondary)

opsbench ships a thin MCP wrapper around `cedar-gate` so Claude Code's
pre-tool-use hook can call it without spawning a subprocess per check:

```jsonc
{
  "mcpServers": {
    "cedar-broker": {
      "command": "uvx",
      "args": ["opsbench-cedar-broker-mcp@latest"],
      "env": {
        "CEDAR_POLICY_BUNDLE": "${OPSBENCH_CEDAR_BUNDLE_PATH}",
        "CEDAR_ENTITY_STORE": "${OPSBENCH_CEDAR_ENTITIES_PATH}",
        "CEDAR_DECISION_LOG": "${OPSBENCH_AUDIT_LOG_DIR}/cedar.ndjson"
      }
    }
  }
}
```

The broker exposes `cedar.check`, `cedar.explain`, and `cedar.list_policies`;
hook it into Claude Code's `PreToolUse` settings so every MCP call funnels
through `cedar.check` before dispatch.

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode each consume `cedar-gate` via
the same Bash shell-out path used by Pi. The per-host adapter manifests
(pre-tool hooks, settings.json fragments, extension stubs) ship in
`tools/<host>-compat-layer/cedar/` in F5.

## Auth setup

1. The library itself needs no auth — policy evaluation is local and
   deterministic.
2. To fetch the central policy bundle, an agent host needs read access to the
   opsbench `policy-bundles` OCI registry. Store the pull token as
   `opsbench-cedar-bundle-pull` in Azure Key Vault and mount as
   `CEDAR_POLICY_BUNDLE_TOKEN`.
3. Pull the latest bundle to a known path:

   ```bash
   oras pull ghcr.io/opsbench/cedar-bundle:stable \
     -o "${OPSBENCH_CEDAR_BUNDLE_PATH}"
   ```

4. Load the entity store snapshot (agent classes, resources, attributes) from
   the F1 cedar-broker sidecar's `/entities` endpoint or a local export.
5. Verify the toolchain end-to-end:

   ```bash
   cedar-gate doctor
   cedar-gate check --principal 'agent::"recipe-author"' \
     --action 'tools::cli-anything::generate' \
     --resource 'repo::"opsbench/cedar-for-agents-pi-skill"' \
     --json
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `cedar.check` | Allow/Deny decision for a single (principal, action, resource) tuple | open — this **is** the gate |
| `cedar.explain` | Return the matched policies and reasoning trace | open (read-only) |
| `cedar.list_policies` | List active policies in the loaded bundle | open (read-only) |
| `cedar.validate_bundle` | Lint a candidate bundle before deploy | recipe-author + `policy::validate` |
| `cedar.simulate` | Dry-run a request set against a candidate bundle | recipe-author + `policy::simulate` |
| `cedar.load_bundle` | Hot-reload the active policy bundle | `platform-admin` only + human approval |
| `cedar.export_decisions` | Stream the decision log for audit | `audit-reader` + signed query |

## Safety

- Read-only by default: `check`, `explain`, `list_policies`, `validate_bundle`,
  and `simulate` are pure functions over the loaded bundle and entity store.
- `cedar.load_bundle` is the **only** mutating tool and is gated to the
  `platform-admin` agent class plus human approval — incident-response agents
  must never reload policies mid-incident.
- Cedar gating is **mandatory** for all other recipes; the "Recommended Cedar
  gating" column in every recipe's tool table references actions defined here.
  Treat any recipe that omits Cedar gating as a bug.
- Prompt-injection caveat: policy decisions are deterministic on the
  (principal, action, resource, context) tuple — strings inside an LLM prompt
  cannot influence them. However, **agents constructing the tuple can be
  manipulated** to lie about the action or resource. Always derive the action
  name from the dispatcher, never from model-emitted free text.
- Decision logs (`cedar.ndjson`) are append-only and signed; rotate to the
  audit pipeline (F3) so the agent process cannot tamper with its own trail.

## Caveats

- This is a **reference recipe**. The F1 milestone delivers the actual
  `cedar-broker` sidecar, the policy bundle pipeline, and per-host pre-tool
  hooks; nothing here is end-user-installable on its own.
- Cedar-for-Agents is upstream-beta — the AWS Cedar team treats the
  agent-specific entities (principals, actions, contexts) as a moving target.
  Pin to a commit SHA in the F1 broker build, not `main`.
- Apache-2.0 license is vendor-friendly — opsbench may vendor the Rust crate
  and the policy schema inside the broker bundle.
- Performance: each `cedar.check` adds ~1–3 ms of latency. For high-throughput
  loops (e.g. log scanners) batch decisions via `cedar.check_batch` (ships in
  F1) rather than calling per-row.
- Policy authoring requires the Cedar language; opsbench ships a `cedar-fmt`
  pre-commit hook and a starter bundle in F1.
- No public MCP server exists upstream — every host integration in opsbench
  is opsbench-authored.

## See also

- `mcp-recipes/cli-anything-framework.md` — used to generate the Pi-callable
  `cedar-gate` wrapper from the Rust library.
- `mcp-recipes/github-mcp.md` — used by recipe-author to publish the
  `cedar-for-agents-pi-skill` fork.
