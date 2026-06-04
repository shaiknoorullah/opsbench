# MCP Recipe — helm-mcp

Helm MCP server exposing read-only Helm chart repository search and lookup.
Called by the **diagnostician** and **release-archaeologist** agent classes during
incidents that trace back to a chart upgrade — "which chart versions are available
for ingress-nginx?", "what's the diff between the deployed appVersion and the
latest patch?", "does this repo still host the chart we pinned?". This server
deliberately surfaces no `helm install`, `helm upgrade`, or `helm uninstall` —
mutation paths route through the cluster-side argocd-mcp or k8s-mcp recipes so
Cedar can gate them properly.

## Source

- Repo: <https://github.com/zekker6/mcp-helm>
- License: MIT
- Maintainer: zekker6 (community)

## Install

```bash
# Vendor-recommended: go install from upstream
go install github.com/zekker6/mcp-helm@latest

# OR clone + build for a pinned tag
git clone https://github.com/zekker6/mcp-helm.git
cd mcp-helm && go build -o mcp-helm .
```

## Configuration — Pi (primary)

Pi has no built-in MCP runtime. Wrap `mcp-helm` as a Pi-callable CLI using
HKUDS/CLI-Anything, then install the resulting skill bundle:

```bash
# Generate the Pi wrapper from upstream source; fork pinned for reproducibility
pi install git:github.com/pnats-ops/helm-mcp-pi-skill
```

The skill exposes a single CLI — `helm-mcp` — with subcommands that proxy each
underlying MCP tool over stdio. Then add to `~/.pi/agent/AGENTS.md` (or per-project
`SYSTEM.md`):

```markdown
## Helm chart repo lookup

When an incident references a Helm chart upgrade, downgrade, or version drift,
use the `helm-mcp` wrapper. This wrapper is strictly read-only — it cannot
install, upgrade, or uninstall releases. For cluster-side release mutations,
route through `argocd-mcp` or `k8s-mcp` so Cedar policies apply.

Examples:
- `helm-mcp search-repo ingress-nginx --repo https://kubernetes.github.io/ingress-nginx`
- `helm-mcp show-chart cert-manager --version v1.15.3 --repo https://charts.jetstack.io`
- `helm-mcp list-versions argo-cd --repo https://argoproj.github.io/argo-helm`
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "helm": {
      "command": "mcp-helm",
      "args": ["--read-only"],
      "env": {
        // Optional: restrict repo URLs the server is allowed to query.
        // Empty/unset = all public repos allowed.
        "HELM_REPO_ALLOWLIST": "https://kubernetes.github.io/ingress-nginx,https://charts.jetstack.io,https://argoproj.github.io/argo-helm,https://grafana.github.io/helm-charts,https://prometheus-community.github.io/helm-charts",
        // Optional cache dir for repo index files (reduces repeated fetches).
        "HELM_CACHE_HOME": "/home/devsupreme/.cache/mcp-helm"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode each consume the `helm-mcp` wrapper
CLI through a small per-host adapter. Configs ship in F5 under
`tools/codex-compat-layer/`, `tools/copilot-compat-layer/`,
`tools/cursor-compat-layer/`, `tools/gemini-compat-layer/`, and
`tools/opencode-compat-layer/`.

## Auth setup

Helm chart repositories used during incident response are typically public —
no auth required for the canonical OSS charts (ingress-nginx, cert-manager,
argo-cd, kube-prometheus-stack, grafana, loki, etc.).

1. Identify the chart repositories your fleet actually pins. Inspect
   `argocd-mcp list-applications` output or `git grep -r 'helm.repository:'`
   across your GitOps repo.
2. For each public repo, no auth is needed — `mcp-helm` fetches the
   `index.yaml` over HTTPS directly.
3. For private OCI registries (e.g. ECR, GHCR with Helm chart support), the
   server reads ambient Helm config: `~/.config/helm/registry/config.json`.
   Log in once via `helm registry login <registry>` before binding the MCP.
4. (Optional) Pin allowed repos via `HELM_REPO_ALLOWLIST` to prevent the agent
   from querying attacker-supplied repo URLs during prompt-injection.
5. Verify end-to-end before binding the MCP:

   ```bash
   mcp-helm --read-only search-repo ingress-nginx \
     --repo https://kubernetes.github.io/ingress-nginx
   # Expect a JSON list of chart versions; non-zero exit = repo unreachable.
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `helm.search_repo` | Search a Helm repo's `index.yaml` for charts matching a name | read-allow |
| `helm.list_versions` | List all versions of a specific chart from a repo | read-allow |
| `helm.show_chart` | Show `Chart.yaml` for a specific chart+version (appVersion, deps) | read-allow |
| `helm.show_values` | Show default `values.yaml` for a chart+version | read-allow |
| `helm.show_readme` | Show README.md for a chart+version | read-allow |
| `helm.repo_index` | Fetch and parse a repo's raw `index.yaml` | read-allow |

This server does NOT surface `helm install`, `helm upgrade`, `helm uninstall`,
`helm rollback`, `helm template`, or `helm dependency update`. Any mutation
path must use the cluster-side argocd-mcp or k8s-mcp recipes.

## Safety

- Read-only by design: the server has no `helm install`/`upgrade`/`uninstall`
  surface. Even with `--read-only` removed, the only methods registered are
  repo search and chart metadata lookup.
- Cedar policies in `packages/team-incident-response/cedar/helm.cedar` apply
  read-allow universally; no mutation policies needed because no mutation tools
  exist.
- Prompt-injection risk on `helm.show_readme`: chart README content is
  attacker-controlled (upstream chart maintainers, or anyone hosting a chart
  repo). The wrapper CLI strips `<tool_use>`-shaped strings and inline
  fenced-code instruction blocks before returning text to the agent.
- Repo allowlist (`HELM_REPO_ALLOWLIST`) is the strongest guard against the
  agent being tricked into fetching from a malicious repo URL embedded in
  another tool's output. Pin it to the repos your fleet actually uses.
- Chart values files frequently contain placeholder secrets or example
  database URLs — never echo `show_values` output verbatim into customer
  channels; redact via the standard PII filter.

## Caveats

- The upstream is a small community project (single maintainer, low commit
  velocity). Pin a release tag, not `main`, and audit diffs before bumping.
- No OCI chart registry support in older releases — verify with
  `mcp-helm --version` that your build includes the OCI patch (post-v0.3.x).
  Without it, charts hosted on ghcr.io/ecr can't be inspected.
- MIT-licensed, vendoring permitted. The opsbench monorepo can carry a fork
  under `tools/helm-mcp/` if upstream goes stale; F5 will document the fork
  policy.
- No release-history surface — to see which chart version is *deployed* in a
  cluster, chain to `k8s-mcp` (`get secret -n <ns> sh.helm.release.v1.*`) or
  `argocd-mcp` (`get-application`). This server only knows what's available
  in the repo, not what's running.
- Repo `index.yaml` files can be several MB for large repos (e.g. bitnami) —
  the cache dir matters; first call is slow, subsequent calls fast.

## See also

- `argocd-mcp.md` — for the actual release state in cluster (which chart
  version is deployed and synced) and gated rollback.
- `k8s-mcp.md` — to inspect Helm release secrets directly when ArgoCD is not
  the deployment vector.
- `github-mcp.md` — to read chart source / Chart.yaml from a GitOps repo
  when the registry view is incomplete.
