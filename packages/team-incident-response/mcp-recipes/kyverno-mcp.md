# MCP Recipe — kyverno-mcp

Kyverno MCP exposes Kubernetes policy authoring, validation, and violation
introspection over the Model Context Protocol. The opsbench `policy-investigator`
agent class calls `violations` and `validate` to explain why a workload was
admission-denied during an incident; the `change-correlator` agent class calls
`apply` (read-only, dry-run) to test whether a proposed remediation would itself
trip a Kyverno policy before the `recovery-executor` is dispatched.

## Source

- Repo: <https://github.com/nirmata/kyverno-mcp>
- License: AGPL-3.0
- Maintainer: Nirmata

## Install

```bash
# Vendor-recommended: build from source (AGPL — external process only, never vendored)
git clone https://github.com/nirmata/kyverno-mcp.git
cd kyverno-mcp
go build -o kyverno-mcp ./cmd/kyverno-mcp

# OR pull the upstream container image
docker pull ghcr.io/nirmata/kyverno-mcp:latest
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships without built-in MCP. Wrap `kyverno-mcp` as a
Pi-callable CLI via HKUDS/CLI-Anything, then install as a Pi skill:

```bash
# 1. Fork upstream and run CLI-Anything to generate a flat CLI surface
#    (one subcommand per MCP tool, JSON in/out). Keep the AGPL binary
#    as an external process — do NOT statically link into the Pi skill.
# 2. Publish the wrapper as a git-installable Pi skill:
pi install git:github.com/<your-fork>/kyverno-mcp-pi-skill
```

Add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```md
## kyverno

For Kubernetes admission-policy violations and dry-run validation, call the
`kyverno-mcp` wrapper CLI installed under
`~/.pi/skills/kyverno-mcp-pi-skill/bin/kyverno-mcp`:

- List recent denials: `kyverno-mcp violations --namespace pnats --since 1h --output json`
- Dry-run a manifest: `kyverno-mcp validate --file /tmp/proposed.yaml --output json`
- Apply (dry-run only by default): `kyverno-mcp apply --file /tmp/policy.yaml --dry-run --output json`

The wrapper shells out to the upstream AGPL binary; respect that boundary and
never embed kyverno-mcp source inside the skill repo.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "kyverno": {
      "command": "kyverno-mcp",
      "args": ["stdio", "--read-only", "--namespaces", "pnats,observability,longhorn-system"],
      "env": {
        "KUBECONFIG": "${HOME}/.kube/opsbench-incident-readonly.kubeconfig"
      }
    }
  }
}
```

For gated dry-run policy authoring (policy-investigator only — Cedar enforces
namespace and explicit `--dry-run`):

```jsonc
{
  "mcpServers": {
    "kyverno-author": {
      "command": "kyverno-mcp",
      "args": ["stdio",
               "--allowed-tools", "violations,validate,apply",
               "--namespaces", "pnats",
               "--require-confirmation",
               "--default-dry-run"],
      "env": {
        "KUBECONFIG": "${HOME}/.kube/opsbench-policy-author.kubeconfig"
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

1. Provision a least-privilege ServiceAccount in the target cluster with `get`,
   `list`, and `watch` on `kyverno.io` resources (Policies, ClusterPolicies,
   PolicyReports) plus the same verbs on the namespaces under investigation.
   No `create`/`update`/`delete` on workload resources.
2. Generate a kubeconfig for that ServiceAccount using
   `kubectl create token kyverno-mcp-incident --duration=8h` and bake it into a
   read-only kubeconfig file (one per profile).
3. Store the kubeconfig as `kyverno-mcp-incident-readonly` in Azure Key Vault;
   the policy-author profile gets its own scoped credential.
4. Export for local Claude Code runs:
   `export KUBECONFIG=$(az keyvault secret show --name kyverno-mcp-incident-readonly --query value -o tsv > /tmp/kc && echo /tmp/kc)`.
5. Verify connectivity (does not mutate):
   `kyverno-mcp violations --namespace pnats --since 5m --output json | jq '.[] | .policy'`.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `violations` | List recent PolicyReport entries / admission denials | Allow for incident-responder, policy-investigator, change-correlator |
| `validate` | Dry-run a manifest against installed policies; return pass/fail with rule context | Allow for policy-investigator, change-correlator |
| `apply` | Install or update a Kyverno Policy/ClusterPolicy | Deny by default; allow for policy-investigator only with `--dry-run` and Cedar-approved namespace |
| `policy-list` | Enumerate installed Kyverno policies in scope | Allow for incident-responder, policy-investigator |
| `policy-get` | Read a single policy's spec and current status | Allow for incident-responder, policy-investigator |
| `report-summary` | Aggregate PolicyReport pass/fail/warn counts per namespace | Allow for incident-responder, change-correlator |

## Safety

- Default posture is read-only (`--read-only`); the author profile is a separate
  `mcpServers` entry so it can be omitted from incident-responder containers.
- Cedar policy MUST gate `apply` on `(namespace, dry_run_flag, change_ticket_id,
  business_hours_window)`. The MCP's `--default-dry-run` is a backstop, not a
  substitute for Cedar — a non-dry-run apply still requires explicit human
  approval routed through the recovery-executor.
- `violations` output can include the rejected resource's full spec, which may
  carry secrets the original admission attempt was trying to mount; treat the
  payload as sensitive and never paste into Slack/Linear unredacted.
- Prompt-injection caveat: policy `failureMessage` strings, resource annotations,
  and admission webhook responses are attacker-controllable via PR to the policy
  repo. The MCP returns them verbatim; the agent must not follow instructions
  encoded in Kyverno-rendered fields.
- A buggy ClusterPolicy applied without `--dry-run` can deny the entire cluster's
  admission traffic. The author profile MUST set `--default-dry-run` and Cedar
  MUST refuse any `apply` whose payload removes a `validationFailureAction:
  Audit` from an existing policy without an explicit override claim.

## Caveats

- License is AGPL-3.0 — the MCP binary is invoked as an **external process only**
  and is **never vendored** into opsbench packages or the Pi skill repo. If you
  fork to add the CLI-Anything wrapper, retain the AGPL notice and keep the
  upstream binary as a runtime dependency (downloaded at install time), not a
  bundled artifact.
- Network egress requirement: the MCP talks to the Kubernetes API server via the
  supplied kubeconfig. On the OVH cluster this goes through the systemd SSH
  tunnel; if the tunnel is down, `violations` will time out before returning.
- Kyverno itself must be installed in the target cluster (>=1.10 recommended).
  This MCP does not install Kyverno; if the controller is absent, `policy-list`
  returns empty without a clear error — pair with `kubernetes-mcp` to confirm
  the `kyverno` Deployment is healthy before triaging.
- No first-class support for the Kyverno CLI's `test` harness in the current
  release — for CI policy unit tests, drive the upstream `kyverno test` binary
  directly from the wrapper rather than expecting an MCP tool.
- Project is maintained by Nirmata (commercial sponsor of upstream Kyverno);
  pin to a tagged release in CI rather than `@latest` to avoid surprise API
  shifts between minor versions.

## See also

- `kubernetes-mcp.md` — cluster-level reads to confirm the Kyverno controller
  itself is healthy before relying on its admission reports.
- `argocd-mcp.md` — correlate Kyverno denials with the Argo CD sync that tried
  to apply the rejected manifest.
