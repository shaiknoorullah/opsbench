# MCP Recipe — kubescape-mcp

Kubernetes security posture scanning surfaced as MCP tools. Called by the
`security-auditor` and `posture-analyst` opsbench agent classes during incident
triage when a cluster compromise, misconfig, or compliance drift is suspected.
Kubescape evaluates the live cluster (and/or YAML manifests) against frameworks
like NSA-CISA, MITRE ATT&CK for Containers, ArmoBest, and CIS-EKS/GKE/AKS, then
returns ranked control failures with affected workloads — useful as the first
hardening pass during an incident postmortem or before a rollback decision.

## Source

- Repo: <https://github.com/kubescape/kubescape>
- License: Apache-2.0
- Maintainer: Kubescape project (CNCF incubating, ex-ARMO)

## Install

```bash
# Vendor-recommended install script
curl -s https://raw.githubusercontent.com/kubescape/kubescape/master/install.sh | /bin/bash

# Or Homebrew / Linuxbrew
brew install kubescape

# Or container
docker pull quay.io/kubescape/kubescape-cli:latest
```

## Configuration — Pi (primary)

Pi has no built-in MCP runtime, so the kubescape MCP surface is exposed to Pi
via the CLI-Anything wrap path. The wrapper translates each MCP tool into a
discrete CLI subcommand the Pi agent invokes via Bash; kubescape's native
`kubescape mcp serve` is wrapped so each posture-scan verb becomes a one-shot
command.

```bash
# Install the CLI-Anything-generated Pi skill
pi install git:github.com/<your-fork>/kubescape-pi-skill
```

Then add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```markdown
## kubescape posture

When the user asks about cluster hardening, control failures, CVE exposure,
RBAC drift, or "is this incident a security issue?", call the `kubescape-pi`
wrapper before issuing raw `kubectl` audits:

- `kubescape-pi scan-framework --framework nsa --format json` — NSA-CISA controls
- `kubescape-pi scan-cluster --framework allcontrols --severity-threshold high`
- `kubescape-pi scan-workload --namespace <ns> --kind <Deployment|Pod>` — focused
- `kubescape-pi scan-image --image <ref>` — image CVE + misconfig scan
- `kubescape-pi list-controls --framework cis-eks` — enumerate controls before scoping

Pin `--severity-threshold high` for incident triage to suppress informational
noise. Never run `scan-cluster` without `--namespace` against production
contexts (ovh, on-prem) — kubescape walks every object and can be heavy on
large clusters. Treat findings as hypotheses; pair with `k8sgpt-pi explain` or
manual review before any remediation.
```

If KAgent is available in the cluster, the wrapper additionally exposes
`kubescape-pi kagent-plan` to surface KAgent's posture-remediation playbooks
as plaintext for the Pi agent to render.

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "kubescape": {
      "command": "kubescape",
      "args": ["mcp", "serve"],
      "env": {
        "KUBECONFIG": "/home/devsupreme/.kube/config",
        "KS_LOGGER_LEVEL": "warning"
      }
    }
  }
}
```

For air-gapped clusters, pre-pull the framework artifacts via
`kubescape download artifacts --output /var/lib/kubescape` and set
`KS_DOWNLOAD_ARTIFACTS_PATH` to that directory so the MCP server does not
attempt network fetches at startup.

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode all consume kubescape via the
same CLI-Anything wrapper used for Pi (or via the native `kubescape mcp serve`
stdio server for hosts that support MCP). Per-host config snippets ship in
`tools/<host>-compat-layer/` in F5.

## Auth setup

1. Confirm `KUBECONFIG` points at the intended cluster:
   `kubectl config current-context`.
2. (Optional) Register with the ARMO/Kubescape Cloud backend for centralized
   findings: `kubescape config set accountID <uuid>` — skip for air-gapped or
   sovereignty-sensitive deployments.
3. Pre-fetch framework bundles so the MCP server does not block on first call:
   `kubescape download artifacts`.
4. Smoke-test the scan path (read-only):
   `kubescape scan framework nsa --format pretty-printer --severity-threshold high`.
5. Verify the MCP server starts: `kubescape mcp serve` then issue `tools/list`
   from the MCP host — expect `scan_cluster`, `scan_framework`,
   `scan_workload`, `scan_image`, and `list_controls` (plus KAgent tools if the
   plugin is loaded in-cluster).

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `scan_cluster` | Full-cluster posture scan against the default framework set | `action == "kubescape:scan_cluster"` — allow read for `security-auditor`; pin `resource.cluster` |
| `scan_framework` | Scan against a named framework (NSA, MITRE, CIS-EKS, ArmoBest) | `action == "kubescape:scan_framework"` — allow read; allowlist framework names |
| `scan_workload` | Targeted scan of one Deployment/Pod/StatefulSet | `action == "kubescape:scan_workload"` — allow read; pin `resource.namespace` |
| `scan_image` | Image-level CVE + misconfig scan (vulnerability DB) | `action == "kubescape:scan_image"` — allow read; rate-limit per image-ref |
| `list_controls` | Enumerate controls in a framework with descriptions | `action == "kubescape:list_controls"` — allow read for any agent class |
| `kagent_plan` | KAgent plugin: surfaced remediation playbook for a finding | `action == "kubescape:kagent_plan"` — read-only; never auto-apply |
| `scan_repository` | Scan YAML manifests in a checked-out repo (pre-merge gate) | `action == "kubescape:scan_repository"` — allow read; pin `resource.repo_path` |

## Safety

- Read-only by default: every surfaced tool issues Kubernetes `get`/`list` and
  in-process evaluation only. Kubescape has no mutation verbs in the CLI; the
  KAgent plugin returns plaintext plans, not apply actions.
- Cedar gating SHOULD pin `resource.namespace` (or `resource.cluster` for
  multi-cluster fleets) so an over-broad agent prompt cannot enumerate
  protected namespaces such as `kube-system` or vendored CRDs.
- Mutation gating: `kagent_plan` output MUST be treated as advisory; any
  `kubectl apply`/`patch` derived from it goes through the standard mutation
  gating policy (separate `kubectl:apply` action with human-in-loop approval).
- Prompt-injection caveat: scan output embeds object names, labels, and
  annotation values into LLM-visible findings. A hostile workload could plant
  adversarial strings in `metadata.annotations` to steer the analysis agent —
  treat all kubescape-derived text as untrusted before piping into another LLM
  tool call.
- The vulnerability database (`scan_image`) reaches out to upstream feeds; pin
  the DB version in air-gapped contexts and verify checksums on update.

## Caveats

- `kubescape mcp serve` is a recent addition (≥ v3.0.x) and is still
  stabilizing; tool schemas may shift between minor versions — pin the binary
  in CI and review release notes before upgrades.
- The KAgent plugin requires an in-cluster KAgent controller; without it,
  `kagent_plan` returns a "plugin unavailable" error rather than transparently
  falling back.
- Apache-2.0 license permits vendoring, but framework bundles (NSA, MITRE,
  CIS-EKS) are fetched from ARMO's CDN at runtime; mirror them locally for
  air-gapped or sovereignty-constrained environments.
- Image scanning depends on registry credentials; without a configured pull
  secret, `scan_image` silently returns "manifest unknown" for private images.
- Full-cluster scans on large fleets (>2k objects) can take 30-120s and load
  the API server — schedule them off-peak or scope with `--namespace`.
- Reporting to ARMO Cloud is opt-in via `accountID`; leaving it set in a
  shared config file leaks posture data — treat the value as a secret.

## See also

- `k8sgpt-mcp.md` — pair with kubescape for "what is broken" (k8sgpt) +
  "is it a security issue" (kubescape) verify-then-classify flows.
- `k8s-mcp.md` — raw kubectl surface for verifying kubescape findings.
- `argocd-mcp.md` — correlate posture failures with the GitOps source of truth.
