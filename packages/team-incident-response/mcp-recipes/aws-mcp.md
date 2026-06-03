# MCP Recipe — aws-mcp

AWS Labs MCP server bundle (Lambda, S3, CloudWatch, CloudTrail). Optional — only required
when AWS resources are part of the incident scope (currently: none in pnats infra).

## Source

- Repo: <https://github.com/awslabs/mcp>
- License: Apache-2.0
- Maintainer: AWS (official)

## Install

```bash
uv tool install awslabs-cloudwatch-mcp-server
uv tool install awslabs-cloudtrail-mcp-server
uv tool install awslabs-s3-mcp-server
```

## Configuration

```jsonc
{
  "mcpServers": {
    "aws-cloudwatch": {
      "command": "uv",
      "args": ["tool", "run", "awslabs-cloudwatch-mcp-server", "--read-only"],
      "env": {
        "AWS_PROFILE": "incident-response-ro",
        "AWS_REGION": "ap-south-1"
      }
    },
    "aws-cloudtrail": {
      "command": "uv",
      "args": ["tool", "run", "awslabs-cloudtrail-mcp-server"],
      "env": {
        "AWS_PROFILE": "incident-response-ro",
        "AWS_REGION": "ap-south-1"
      }
    }
  }
}
```

## Auth setup

1. Create an IAM user with the `ReadOnlyAccess` AWS-managed policy.
2. Add `AWS_PROFILE=incident-response-ro` to `~/.aws/credentials`.
3. For STS / SSO setups, use `aws sso login` before launching the MCP.

## Read-only verification

`ReadOnlyAccess` denies all mutation actions at the IAM layer regardless of MCP flag.
The MCP's `--read-only` is a defense-in-depth measure.

## Caveats

- **Currently not in use** — pnats infrastructure is Azure + Contabo + OVH + on-prem.
  This recipe is documented for future tenants whose stack includes AWS.
- CloudTrail lookup is global (us-east-1 by default for the management events log);
  override via `AWS_REGION` when investigating data-plane events.
- S3 listing is region-aware — for cross-region object discovery, iterate regions.
