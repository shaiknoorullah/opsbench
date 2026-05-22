# Roadmap

This document outlines the planned trajectory of opsbench. Items are guidance, not commitments — PRs move them faster.

## Now (v3.x)

- **`team-incident-response`** — stabilize, add more MCP recipes (Falco, OpenCTI, TheHive), ship Codex CLI variants.
- **Tooling** — CI hardening (matrix expansion, supply-chain attestation), docs site polish (VitePress).
- **Installer** — package-manager builds (Homebrew tap, AUR, nix flake).

## Next (v4.x)

- **`team-platform-engineering`** — IaC orchestrator agents (Terraform, Pulumi, Crossplane), GitOps pipeline runners (ArgoCD, Flux), drift detection, environment promotion.
- **`team-data-platform`** — backup verifiers, schema-migration agents (Liquibase/Flyway/Atlas), CDC pipeline troubleshooting.

## Later (v5.x+)

- **`team-security-response`** — detection (Falco, Wazuh), triage (TheHive, OpenCTI), endpoint forensics (Velociraptor), Kubernetes admission policy authoring.
- **`team-network-operations`** — BGP/route troubleshooting, mesh VPN ops (WireGuard, Nebula), edge config (Cloudflare, Fastly).
- **`team-it-helpdesk`** — identity (Entra ID, Okta), endpoint (Intune, Jamf), M365 / Google Workspace tenant ops.

## Cross-cutting initiatives

- **Codex CLI parity** — every Claude Code skill ships a Codex CLI variant via `tools/codex-compat-layer/`.
- **Schema federation** — publish all JSON schemas to schema.opsbench.io for consumption by other tools.
- **Plugin marketplace** — when a public Claude Code plugin marketplace exists, register the opsbench plugin there.
- **Cedar policy library** — a community-curated catalog of least-privilege policies for common agent shapes.

## How items move

- File a [feature request](.github/ISSUE_TEMPLATE/feature_request.yml) to add or amend a roadmap item.
- File a [new-team proposal](.github/ISSUE_TEMPLATE/new-team-proposal.yml) to add a team.
- Open a PR to update this document if your initiative crosses an existing item.
