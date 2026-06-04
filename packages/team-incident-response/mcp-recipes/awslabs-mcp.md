# MCP Recipe — awslabs-mcp

AWS Labs MCP server bundle (one MCP per service: EKS, CloudWatch, IAM, Cost Explorer, S3).
Called by the **diagnostician** agent class during AWS-scoped incidents (control-plane
health, alarm/log retrieval, cost anomalies, blob inspection) and by the
**recovery-executor** for narrowly-gated mutations such as EKS node-group scale or S3
object restore. Bind only the per-service MCPs an incident actually needs — the bundle
is composable, not monolithic.

## Source

- Repo: <https://github.com/awslabs/mcp>
- License: Apache-2.0
- Maintainer: AWS (official)

## Install

```bash
# Per-service install via uv (AWS recommends one tool per service)
uv tool install awslabs-eks-mcp-server
uv tool install awslabs-cloudwatch-mcp-server
uv tool install awslabs-iam-mcp-server
uv tool install awslabs-cost-explorer-mcp-server
uv tool install awslabs-s3-mcp-server
```

## Configuration — Pi (primary)

Pi has no built-in MCP runtime. Wrap each `awslabs-*-mcp-server` as a Pi-callable CLI
using HKUDS/CLI-Anything, then install the resulting skill bundle:

```bash
# Generate Pi wrappers (one-time, per-service); fork pinned for reproducibility
pi install git:github.com/pnats-ops/awslabs-mcp-pi-skill
```

The skill exposes five CLI subcommands — `awslabs-eks`, `awslabs-cloudwatch`,
`awslabs-iam`, `awslabs-cost`, `awslabs-s3` — each of which proxies to the underlying
MCP server over stdio. Then add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```markdown
## AWS read-only diagnostics

When an incident involves AWS resources, invoke the wrappers via Bash. Always pass
`--read-only` and pin `--region`. Never call mutating subcommands without an explicit
Cedar approval token in the environment (`OPSBENCH_CEDAR_APPROVAL`).

Examples:
- `awslabs-cloudwatch logs query --log-group /aws/eks/prod --since 30m --read-only`
- `awslabs-eks describe-cluster --name prod-apse1 --read-only --region ap-southeast-1`
- `awslabs-cost get-anomalies --since 24h --read-only`
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "aws-eks": {
      "command": "uv",
      "args": ["tool", "run", "awslabs-eks-mcp-server", "--read-only"],
      "env": {
        "AWS_PROFILE": "incident-response-ro",
        "AWS_REGION": "ap-southeast-1"
      }
    },
    "aws-cloudwatch": {
      "command": "uv",
      "args": ["tool", "run", "awslabs-cloudwatch-mcp-server", "--read-only"],
      "env": {
        "AWS_PROFILE": "incident-response-ro",
        "AWS_REGION": "ap-southeast-1"
      }
    },
    "aws-iam": {
      "command": "uv",
      "args": ["tool", "run", "awslabs-iam-mcp-server", "--read-only"],
      "env": { "AWS_PROFILE": "incident-response-ro" }
    },
    "aws-cost": {
      "command": "uv",
      "args": ["tool", "run", "awslabs-cost-explorer-mcp-server", "--read-only"],
      "env": { "AWS_PROFILE": "incident-response-ro" }
    },
    "aws-s3": {
      "command": "uv",
      "args": ["tool", "run", "awslabs-s3-mcp-server", "--read-only"],
      "env": {
        "AWS_PROFILE": "incident-response-ro",
        "AWS_REGION": "ap-southeast-1"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode each consume the wrapper CLIs through a
small per-host adapter. Configs ship in F5 under `tools/codex-compat-layer/`,
`tools/copilot-compat-layer/`, `tools/cursor-compat-layer/`,
`tools/gemini-compat-layer/`, and `tools/opencode-compat-layer/`.

## Auth setup

1. Create an IAM principal (user or role) and attach the AWS-managed
   `ReadOnlyAccess` policy plus `AWSBillingReadOnlyAccess` for Cost Explorer.
2. Configure a named profile: `aws configure --profile incident-response-ro`
   (or `aws sso login --profile incident-response-ro` for IAM Identity Center).
3. For unattended/CI runs, assume a role via `AWS_ROLE_ARN` + `AWS_WEB_IDENTITY_TOKEN_FILE`
   (IRSA, GitHub OIDC, or EC2 instance profile).
4. Set `AWS_REGION` (or `AWS_DEFAULT_REGION`) — Cost Explorer ignores region but the
   other servers require it.
5. Verify identity end-to-end before binding the MCP:
   `aws sts get-caller-identity --profile incident-response-ro` should return the
   expected ARN.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `eks.describe_cluster` | EKS control-plane status, version, endpoints | read-allow |
| `eks.list_nodegroups` / `update_nodegroup_config` | Inspect / scale node groups | read-allow / mutation-gate (severity ≥ SEV-2) |
| `cloudwatch.get_metric_data` | Time-series metrics for alarms and anomalies | read-allow |
| `cloudwatch.filter_log_events` | Log Insights / log group queries | read-allow |
| `iam.simulate_principal_policy` | Diagnose access-denied without granting access | read-allow |
| `cost_explorer.get_cost_and_usage` | Cost anomaly investigation | read-allow |
| `s3.list_objects` / `get_object` / `restore_object` | Blob inspection and restore | read-allow / mutation-gate + dual-control for restore |

## Safety

- All five servers ship with a `--read-only` flag — bind it by default in every
  recipe variant. Mutation servers must be opt-in via a separate `mcpServer` entry.
- Cedar gating policies live in `packages/team-incident-response/cedar/aws.cedar` —
  reads are allow-by-default, writes require an explicit policy attaching to the
  agent identity + incident-class + resource-tag (`Environment=prod` blocks writes
  unless severity ≥ SEV-1 with on-call approval).
- IAM at the principal layer is the authoritative guard: `ReadOnlyAccess` denies all
  mutations regardless of MCP flag — defense in depth.
- Prompt-injection risk on `cloudwatch.filter_log_events`: log contents are
  attacker-controlled. The agent must strip `<tool_use>`-shaped strings from log
  excerpts before reasoning over them; the wrapper CLI applies a sanitizer pass.
- Cost Explorer can leak account financial data — restrict the MCP to incident
  responders and never expose its output in customer-facing channels.

## Caveats

- One MCP server per service means five separate processes — startup latency adds
  up. For laptops, lazy-load: only bind the servers an incident actually needs.
- Cost Explorer has a per-API-call fee (~$0.01 per request) — cache responses and
  avoid repeated polling.
- CloudWatch Logs Insights queries have a 5-minute timeout and a 10k-row cap; for
  long incident windows, split by time range or push to S3 export.
- EKS MCP does not surface `kubectl` — for pod-level diagnostics, chain to the
  `k8s-mcp` recipe after `eks.describe_cluster` confirms control-plane health.
- Apache-2.0 license permits vendoring, but AWS Labs marks several servers as
  **beta** in their README — pin a release tag, not `main`.

## See also

- `aws-mcp.md` — the original single-bundle AWS recipe (deprecated in favor of
  per-service awslabs servers).
- `k8s-mcp.md` — pair with `eks.describe_cluster` for full EKS workload diagnostics.
- `azure-mcp.md` — analogous structure for Azure-scoped incidents.
