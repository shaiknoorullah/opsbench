# MCP Recipe — gcloud-mcp

Google Cloud MCP server bundle for GKE inspection, Cloud Logging queries, IAM read,
and Pub/Sub topic/subscription state. Called by the **diagnostician** and
**root-cause-analyst** opsbench agent classes when an incident touches GCP-hosted
workloads (multi-cloud tenants only — not used in pnats infra today).

## Source

- Repo: <https://github.com/googleapis/gcloud-mcp>
- License: Apache-2.0
- Maintainer: Google (official, googleapis org)

## Install

```bash
npm install -g @googleapis/gcloud-mcp
# OR run via npx without install
npx -y @googleapis/gcloud-mcp@latest --help
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships without built-in MCP — its integration model is CLI
tools the agent calls via Bash, plus extensions installed via `pi install`. Because
`gcloud-mcp` is an MCP server (not a Pi extension), opsbench ships a thin CLI wrapper
generated with [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) that exposes
each MCP tool as a flat subcommand. Install the wrapper as a Pi skill:

```bash
pi install git:github.com/opsbench/gcloud-mcp-pi-skill
```

Then add the following to your project `AGENTS.md` (or `~/.pi/agent/AGENTS.md` for a
global default) so the agent knows when to call the wrapper:

```markdown
## GCP read access

When you need to inspect GCP state (GKE pods/nodes, Cloud Logging entries, IAM
bindings, Pub/Sub topics), call the `gcloud-mcp-cli` wrapper, e.g.:

  gcloud-mcp-cli gke list-clusters --project=$GCP_PROJECT
  gcloud-mcp-cli logging read --filter='severity>=ERROR' --limit=50
  gcloud-mcp-cli iam list-policy --resource=projects/$GCP_PROJECT

The wrapper is read-only by default. Never invoke `--allow-mutations`; mutations
must be routed through the recovery-executor agent (Cedar-gated).
```

A `SYSTEM.md` snippet pinning the project and a service-account JSON path lives in
`tools/pi-compat-layer/gcloud-mcp/` and ships in F5 alongside the wrapper repo.

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "gcloud": {
      "command": "npx",
      "args": ["-y", "@googleapis/gcloud-mcp@latest", "--read-only"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/home/devsupreme/.config/gcloud/incident-response-ro.json",
        "GCP_PROJECT":                    "pnats-multicloud-prod",
        "GCP_REGION":                     "asia-south1"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode each have their own MCP/extension
config dialect. Translation shims and per-host config snippets live under
`tools/codex-compat-layer/`, `tools/copilot-compat-layer/`,
`tools/cursor-compat-layer/`, `tools/gemini-compat-layer/`, and
`tools/opencode-compat-layer/`. Those layers ship in F5 — until then, adapt the
Claude Code JSONC block above using the host's documented MCP wiring.

## Auth setup

1. Create a dedicated service account with read-only roles on the target project:

   ```bash
   gcloud iam service-accounts create incident-response-ro \
     --display-name="opsbench incident response (read-only)" \
     --project=pnats-multicloud-prod
   ```

2. Grant the minimum role bundle (Viewer + Logs Viewer + Pub/Sub Viewer + GKE Viewer):

   ```bash
   for ROLE in roles/viewer roles/logging.viewer \
               roles/pubsub.viewer roles/container.viewer; do
     gcloud projects add-iam-policy-binding pnats-multicloud-prod \
       --member="serviceAccount:incident-response-ro@pnats-multicloud-prod.iam.gserviceaccount.com" \
       --role="$ROLE"
   done
   ```

3. Export the SA key (or prefer Workload Identity Federation for prod laptops):

   ```bash
   gcloud iam service-accounts keys create \
     ~/.config/gcloud/incident-response-ro.json \
     --iam-account=incident-response-ro@pnats-multicloud-prod.iam.gserviceaccount.com
   ```

4. Point either `GOOGLE_APPLICATION_CREDENTIALS` at the key file, OR run
   `gcloud auth application-default login` for interactive ADC.
5. Verify the credential resolves and is read-only:

   ```bash
   gcloud auth application-default print-access-token >/dev/null && echo "ADC OK"
   gcloud projects get-iam-policy pnats-multicloud-prod \
     --flatten=bindings --filter="bindings.members:incident-response-ro*" \
     --format="value(bindings.role)" | sort -u
   # Should list only viewer-family roles — never roles/owner or roles/editor.
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|---|---|---|
| `gke.list_clusters` | Enumerate GKE clusters in the project | read-only, no gate |
| `gke.describe_pod` | Pod status, events, restartCount | read-only, no gate |
| `logging.read` | Cloud Logging entries (filter + limit) | read-only, rate-limit per agent |
| `logging.tail` | Stream live log entries | read-only, time-bounded by Cedar |
| `iam.get_policy` | Project / resource IAM bindings | read-only, no gate |
| `pubsub.list_topics` | Topic + subscription inventory | read-only, no gate |
| `pubsub.pull_messages` | Sample messages from a subscription | gated — can `ack` mutates queue state |

## Safety

- **Read-only by default.** `--read-only` (Claude Code) and the wrapper's default
  mode block all `create`, `update`, `delete`, `patch`, `setIamPolicy`, and any
  Pub/Sub `publish`/`ack`/`modify-ack` verbs.
- **Cedar gating.** Mutation surfaces (`pubsub.pull_messages` with auto-ack,
  `gke.exec`, anything under `--allow-mutations`) are gated by Cedar policies in
  `packages/team-incident-response/cedar/` and require the recovery-executor agent
  role plus explicit incident-ticket context.
- **Prompt-injection caveat.** Cloud Logging entries are untrusted input — log lines
  produced by tenant workloads can contain prompt-injection payloads. The
  diagnostician agent runs log output through the injection-filter middleware
  before the model sees it (see `team-incident-response/middleware/`).
- **Service-account key on disk.** Prefer Workload Identity Federation; if a JSON
  key must be used, keep it mode-`0600` and rotate every 90 days via Cedar policy
  `key-rotation-90d`.

## Caveats

- **Beta status.** `@googleapis/gcloud-mcp` is currently a Google preview — tool
  names and JSON shapes can change between minor versions. Pin the version in
  Claude Code config (`@googleapis/gcloud-mcp@x.y.z`) once a tenant goes live.
- **Not in use today.** pnats infra is Azure + Contabo + OVH + on-prem; this recipe
  is documented for multi-cloud tenants only.
- **License: Apache-2.0** — safe to vendor or fork for the CLI-Anything wrapper.
  (Compare with AGPL recipes which are external-only and never vendored.)
- **Cloud Logging cost.** `logging.read` with a wide filter and large `limit`
  triggers billable scan volume — agents should cap `limit<=500` and prefer
  narrow `resource.type=` filters.
- **GKE Autopilot vs Standard.** Some `gke.*` tools surface different fields on
  Autopilot clusters; the diagnostician must check `cluster.mode` before reasoning
  about node pool sizing.
- **Infra prereqs.** Requires `gcloud` CLI 480+ on the host running the wrapper, and
  outbound HTTPS to `*.googleapis.com`.

## See also

- `aws-mcp.md` — equivalent read-only bundle for AWS multi-cloud tenants.
- `azure-mcp.md` — Azure ARM + Monitor + Key Vault MCP for the primary pnats stack.
- `k8s-mcp.md` — generic Kubernetes MCP (use this against any kubeconfig including
  GKE when you don't need GCP-specific surfaces).
