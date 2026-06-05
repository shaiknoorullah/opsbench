# MCP Recipe — cli-anything-framework

CLI-Anything is a **framework** (not an MCP server) from HKUDS that generates
agent-callable CLIs from arbitrary Python/Node sources. Used by opsbench
**recipe-author** and **tool-wrapper** agent classes to bootstrap Pi-callable
wrappers when an upstream tool ships no MCP server, no CLI, or only a Python
SDK. Output is a deterministic CLI with `--json` stdout that Pi/Claude can shell
out to via Bash.

## Source

- Repo: <https://github.com/HKUDS/CLI-Anything>
- License: Apache-2.0
- Maintainer: HKUDS (HKU Data Science Lab)

## Install

```bash
# Vendor-recommended (PyPI hub)
pip install cli-anything-hub

# OR from source (pinned commit for reproducible wrapper builds)
pip install "git+https://github.com/HKUDS/CLI-Anything@main"

# Requires Python 3.10+
python --version  # → Python 3.10.x or higher
```

## Configuration — Pi (primary)

CLI-Anything is itself a framework — it doesn't expose tools to Pi directly.
Instead, opsbench uses it to **generate** Pi-callable wrappers around upstream
tools that lack a CLI or MCP. The generated wrappers are then installed as Pi
skills.

Typical workflow:

```bash
# 1. Generate a wrapper CLI from an upstream Python source
cli-anything generate \
  --source ./upstream-tool-src \
  --output ./my-tool-pi-skill \
  --emit-json \
  --skill-manifest

# 2. Push the generated skill to your fork
cd ./my-tool-pi-skill && git init && git remote add origin \
  git@github.com:<your-fork>/my-tool-pi-skill.git && git push

# 3. Install into Pi as a skill
pi install git:github.com/<your-fork>/my-tool-pi-skill
```

AGENTS.md snippet — direct Pi to call the generated wrapper:

```markdown
## Tool: my-tool

When the user asks for <task>, call the wrapper CLI installed via the
my-tool-pi-skill Pi skill:

  my-tool <subcommand> --json

Always pass --json so output is structured. Never call the upstream Python
SDK directly — the wrapper applies Cedar policy gating and audit logging that
the raw SDK bypasses.
```

For the framework itself (if recipe-author wants Pi to drive wrapper
generation), install CLI-Anything's own meta-skill:

```bash
pi install git:github.com/opsbench/cli-anything-pi-skill
```

## Configuration — Claude Code (secondary)

CLI-Anything has no MCP server. opsbench ships a thin MCP wrapper that exposes
`generate`, `validate`, and `publish` as MCP tools for Claude Code's
recipe-author agent:

```jsonc
{
  "mcpServers": {
    "cli-anything": {
      "command": "uvx",
      "args": ["opsbench-cli-anything-mcp@latest"],
      "env": {
        "CLI_ANYTHING_WORKDIR": "${OPSBENCH_WRAPPER_BUILD_DIR}",
        "GITHUB_TOKEN": "${OPSBENCH_WRAPPER_PUBLISH_TOKEN}"
      }
    }
  }
}
```

For ad-hoc Claude Code sessions without the wrapper MCP, drive `cli-anything`
directly via Bash — it's stdout-clean and JSON-emitting.

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode all consume CLI-Anything via the
generated wrapper CLIs (same Bash shell-out path as Pi). The host-specific
skill/extension manifests for each ship in `tools/<host>-compat-layer/` in F5.
For now: drive `cli-anything` via Bash and consume `--json` output.

## Auth setup

1. CLI-Anything itself requires no auth — it's a code generator.
2. Generated wrappers inherit the upstream tool's auth model; configure
   per-wrapper (env vars, OAuth, API keys) in the generated `manifest.yaml`.
3. To publish a generated wrapper as a Pi skill, you need a GitHub token with
   `repo:write` on your fork org. Store as `opsbench-wrapper-publish-pat` in
   Azure Key Vault.
4. For reproducible builds, pin the upstream source by commit SHA in
   `cli-anything generate --source-rev <sha>`.
5. Verify the install:

   ```bash
   cli-anything --version
   cli-anything doctor   # checks Python version, build deps, network reach
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `cli-anything generate` | Build a CLI wrapper from upstream Python source | recipe-author only; `tools/cli-anything/generate` action |
| `cli-anything validate` | Lint a generated wrapper against the skill spec | open (read-only) |
| `cli-anything publish` | Push wrapper to GitHub + emit Pi-skill manifest | recipe-author + Cedar `publish:github` action; require human approval |
| `cli-anything doctor` | Check toolchain prerequisites | open (read-only) |
| `cli-anything diff` | Compare wrapper output across upstream revisions | open (read-only) |
| `cli-anything bench` | Run the generated CLI against a fixture suite | open (read-only) |
| `cli-anything sign` | Sign the generated wrapper bundle (cosign) | recipe-author + Cedar `sign:bundle` |

## Safety

- Generated wrappers default to `--read-only` mode unless the upstream tool's
  manifest explicitly opts in to mutation surfaces; opsbench's wrapper template
  refuses to emit destructive subcommands without a `--mutating-ok` flag.
- All wrapper-publish actions are Cedar-gated to the `recipe-author` agent
  class plus human approval — never grant publish rights to incident-response
  agents at runtime.
- The generator reads upstream source code; treat upstream repos as untrusted
  input. Run `cli-anything generate` inside a sandboxed build container (the
  F4 wrapper-build pipeline does this automatically).
- Prompt-injection caveat: if the upstream tool ships LLM-targeted docstrings
  or README copy, those strings can land in the generated CLI's `--help` text.
  Strip docstrings with `--no-passthrough-docstrings` for security-sensitive
  wrappers.
- The wrapper's `--json` mode is mandatory for agent use; the human-friendly
  text mode is unstructured and trivially confused by injection.

## Caveats

- Framework, not an MCP server — Pi/Claude do not talk to CLI-Anything
  directly at incident-response runtime; only at recipe-authoring time.
- Python 3.10+ required; on older infra hosts, run inside the F4 build
  container rather than installing system-wide.
- Apache-2.0 license is vendor-friendly — generated wrappers may be vendored
  into opsbench skill bundles. Upstream tools the wrapper targets may have
  stricter licenses; check each upstream before vendoring its wrapper.
- Beta-grade: HKUDS treats CLI-Anything as research-quality; expect API churn
  on the `generate` subcommand. Pin to a known-good commit in CI.
- Cannot wrap binary-only tools (no source) — for those, use the
  `tools/binary-wrapper-template/` skeleton in F5 instead.
- Generated wrappers are not a substitute for a real upstream MCP server when
  one exists; prefer the upstream MCP and fall back to CLI-Anything only when
  the gap is unavoidable.

## See also

- `mcp-recipes/github-mcp.md` — used by recipe-author to publish generated
  wrappers as Pi skills.
- `mcp-recipes/ebpf-observability-mcp.md` — an example of a recipe where the
  upstream tool ships no MCP and a CLI-Anything wrapper bridges the gap.
