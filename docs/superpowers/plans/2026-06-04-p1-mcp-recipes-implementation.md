# P1 — MCP Recipes + Falco Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five new MCP recipes (TheHive, OpenCTI, azure-skills, k8sgpt, CLI-Anything) and one new skill (`falco-event-ingest`) under `packages/team-incident-response/`, plus a standing `docs/integrations.md` index.

**Architecture:** Pure-doc additions. Each recipe follows the existing template (`azure-mcp.md`): Source → Install → Configuration → Auth → Tools surfaced → Safety → Caveats. The Falco skill packages a SKILL.md + templates dir documenting how to wire falcosidekick → CLI-Anything-generated CLI → team-incident-response hypothesis agents. No code or behavior change to any agent or hook.

**Tech Stack:** Markdown, JSONC (for MCP config snippets), YAML (for falcosidekick template), bash (for verification commands).

---

## File structure

```
packages/team-incident-response/mcp-recipes/
├── thehive-mcp.md             (NEW — task 1)
├── opencti-mcp.md             (NEW — task 2)
├── azure-skills-mcp.md        (NEW — task 3)
├── k8sgpt-mcp.md              (NEW — task 4)
├── cli-anything-framework.md  (NEW — task 5)
└── azure-mcp.md               (MODIFY — task 7)

packages/team-incident-response/skills/falco-event-ingest/
├── SKILL.md                                       (NEW — task 6)
└── templates/
    ├── falcosidekick.values.yaml.template         (NEW — task 6)
    ├── cli-anything-harness.md.template           (NEW — task 6)
    └── README.md                                  (NEW — task 6)

packages/team-incident-response/README.md          (MODIFY — task 8)
docs/integrations.md                                (NEW — task 9)
cspell.json                                         (MODIFY — task 10)
```

## Branch & PR

Work on branch `feat/p1-mcp-recipes-and-falco-skill`. Final commit message family: `feat(team-incident-response): ...`. Open one PR titled `feat(team-incident-response): add MCP recipes (TheHive, OpenCTI, azure-skills, k8sgpt, CLI-Anything) and falco-event-ingest skill`.

Each task is its own commit so the PR has a reviewable history. Lefthook will run markdownlint, yamllint, cspell, shellcheck, commitlint on each commit. Local environment may lack yamllint/cspell binaries — use `LEFTHOOK_EXCLUDE=cspell,yamllint` for commits. CI is the source of truth.

---

### Task 0: Create the working branch

**Files:** none (branch only)

- [ ] **Step 1: Confirm on a clean main**

  Run:

  ```bash
  git checkout main && git pull origin main --ff-only && git status
  ```

  Expected: `nothing to commit, working tree clean` on `main`.

- [ ] **Step 2: Create the branch**

  Run:

  ```bash
  git checkout -b feat/p1-mcp-recipes-and-falco-skill
  ```

  Expected: `Switched to a new branch 'feat/p1-mcp-recipes-and-falco-skill'`.

---

### Task 1: Author `thehive-mcp.md` recipe

**Files:**

- Create: `packages/team-incident-response/mcp-recipes/thehive-mcp.md`

**Per spec amendment: this recipe MUST surface upstream's BETA / not-for-production warning prominently and ship safer defaults (`PERMISSIONS_CONFIG=read_only` in the example).**

- [ ] **Step 1: Create the recipe with the exact content below**

  Write to `packages/team-incident-response/mcp-recipes/thehive-mcp.md`:

  ````markdown
  # MCP Recipe — thehive-mcp

  > ⚠️ **EXPERIMENTAL — upstream is in beta and explicitly states "not recommended for production use with real data".**
  > Known limitations: prompt-injection vulnerabilities, data exposure paths, incomplete logging, no TTP support, limited responder functionality.
  > Use against a **staging TheHive instance** with synthetic cases until upstream removes the beta warning, and keep `PERMISSIONS_CONFIG=read_only` unless a write path is explicitly required and Cedar-gated.

  TheHive case management MCP. Use during incident response to query existing cases/alerts/observables, surface related tasks, and (under read-only default) feed evidence into the timeline. Write operations are off by default and must be opened individually via Cedar `tools.cedar`.

  ## Source

  - Repo: <https://github.com/StrangeBeeCorp/TheHiveMCP>
  - License: MIT
  - Maintainer: StrangeBee (TheHive's commercial steward) — official

  ## Install

  ```bash
  # Pre-built binary from upstream releases
  curl -fsSL -o /usr/local/bin/thehivemcp \
    https://github.com/StrangeBeeCorp/TheHiveMCP/releases/latest/download/thehivemcp-linux-amd64
  chmod +x /usr/local/bin/thehivemcp
  ```

  ## Configuration

  ```jsonc
  {
    "mcpServers": {
      "thehive": {
        "command": "/usr/local/bin/thehivemcp",
        "args": ["--transport", "stdio"],
        "env": {
          "THEHIVE_URL":          "https://thehive-staging.example.com",
          "THEHIVE_API_KEY":      "${THEHIVE_INCIDENT_API_KEY}",
          "THEHIVE_ORGANISATION": "incident-response",
          "PERMISSIONS_CONFIG":   "read_only"
        }
      }
    }
  }
  ```

  ## Auth setup

  1. In TheHive UI: **Settings → Organisations → Users**, create a service account named `opsbench-readonly`.
  2. Assign role `analyst` (TheHive's read-mostly role); explicitly deny `manageCase/create`, `manageCase/delete`, `manageAlert/delete`.
  3. Generate an API key under that user; store via 1Password:

     ```bash
     export THEHIVE_INCIDENT_API_KEY="$(op read 'op://Private/thehive-opsbench/api-key')"
     ```

  4. Verify read-only:

     ```bash
     curl -s -H "Authorization: Bearer $THEHIVE_INCIDENT_API_KEY" \
       https://thehive-staging.example.com/api/v1/user/current | jq '.profile'
     # Expected: "analyst" — never "admin" or "org-admin".
     ```

  ## Tools surfaced

  | Tool | Purpose | Recommended Cedar gating |
  | ---- | ------- | ------------------------ |
  | `search-entities` | Query alerts, cases, tasks, observables | Open by default |
  | `manage-entities` | Create/update/delete, comments, promote alerts | **Closed** — open per-agent only when needed |
  | `execute-automation` | Run Cortex analyzers and responders | **Closed** — open with human-gate |
  | `get-resource` | Browse schemas, docs, metadata | Open by default |

  ## Safety

  - **Default to `PERMISSIONS_CONFIG=read_only`.** Switching to `admin` or a custom YAML must be a deliberate, reviewed change.
  - Cedar policy `packages/team-incident-response/policies/tools.cedar` should deny `manage-entities` and `execute-automation` for every agent class except `incident-commander` (and even there, gate behind `human-approval`).
  - Treat all TheHive content as **untrusted input** — agent prompts derived from case descriptions must be sanitized before being fed to other tools (the upstream prompt-injection warning is not theoretical).

  ## Caveats

  - Beta upstream: file bugs to <https://github.com/StrangeBeeCorp/TheHiveMCP/issues> and pin the binary version once you have one that works for your stack.
  - The `OPENAI_API_KEY` env var enables a natural-language fallback when the MCP client lacks sampling support; opsbench's recommended Claude Code setup does not need it.
  - Cortex analyzers run with their own auth — TheHive MCP shells out to them; if you don't have Cortex provisioned, `execute-automation` is non-functional regardless of permissions.
  ````

- [ ] **Step 2: Verify the file lints clean**

  Run:

  ```bash
  npx markdownlint-cli2 "packages/team-incident-response/mcp-recipes/thehive-mcp.md"
  ```

  Expected: `Summary: 0 error(s)`.

- [ ] **Step 3: Verify JSON snippet parses**

  Run:

  ```bash
  awk '/^```jsonc$/,/^```$/{print}' packages/team-incident-response/mcp-recipes/thehive-mcp.md \
    | sed '1d;$d' | jq -e . > /dev/null && echo "valid JSON"
  ```

  Expected: `valid JSON`.

- [ ] **Step 4: Commit**

  Run:

  ```bash
  git add packages/team-incident-response/mcp-recipes/thehive-mcp.md
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "feat(team-incident-response): add thehive-mcp recipe (EXPERIMENTAL)"
  ```

  Expected: `1 file changed, 60+ insertions(+)`.

---

### Task 2: Author `opencti-mcp.md` recipe

**Files:**

- Create: `packages/team-incident-response/mcp-recipes/opencti-mcp.md`

- [ ] **Step 1: Create the recipe with the exact content below**

  Write to `packages/team-incident-response/mcp-recipes/opencti-mcp.md`:

  ````markdown
  # MCP Recipe — opencti-mcp

  OpenCTI threat-intelligence MCP. Use during incident response to look up indicators (IPs, hashes, domains), enrich observables, traverse threat-actor / campaign / TTP relationships, and pull the latest sector-specific reports. Read-only by design — OpenCTI's API token can be scoped to read.

  ## Source

  - Repo: <https://github.com/jhuntinfosec/mcp-opencti>
  - License: MIT
  - Maintainer: Community (jhuntinfosec) — not officially backed by Filigran (OpenCTI's vendor)
  - Fallback: <https://github.com/zxzinn/opencti-mcp> (also MIT) if upstream goes unmaintained

  ## Install

  Requires Python 3.10+ and `uv`:

  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh   # if uv not installed
  git clone https://github.com/jhuntinfosec/mcp-opencti.git /opt/mcp-opencti
  cd /opt/mcp-opencti && uv sync
  ```

  ## Configuration

  ```jsonc
  {
    "mcpServers": {
      "opencti": {
        "command": "uv",
        "args": ["run", "--directory", "/opt/mcp-opencti", "opencti_mcp_server_v7.py"],
        "env": {
          "OPENCTI_URL":   "https://opencti.example.com",
          "OPENCTI_TOKEN": "${OPENCTI_READONLY_TOKEN}"
        }
      }
    }
  }
  ```

  ## Auth setup

  1. In OpenCTI: **Settings → Security → Roles** — create a role `opsbench-readonly` with capabilities `KNOWLEDGE` (read) only. Explicitly omit `KNOWLEDGE_KNUPDATE`, `KNOWLEDGE_KNDELETE`, `MODULES`, `SETTINGS`.
  2. **Settings → Security → Users** — create user `opsbench-readonly@example.com`, assign the role.
  3. Open that user's profile, copy the API token from **API Access**.
  4. Store via 1Password:

     ```bash
     export OPENCTI_READONLY_TOKEN="$(op read 'op://Private/opencti-opsbench/api-token')"
     ```

  5. Verify the token is read-only:

     ```bash
     curl -s -H "Authorization: Bearer $OPENCTI_READONLY_TOKEN" \
       https://opencti.example.com/graphql \
       -d '{"query":"{ me { user_email capabilities { name } } }"}' \
       | jq '.data.me.capabilities[].name'
     # Expected: only KNOWLEDGE — no KNOWLEDGE_KNUPDATE or KNOWLEDGE_KNDELETE.
     ```

  ## Tools surfaced (26+)

  | Category | Examples |
  | -------- | -------- |
  | **Search** | `search_malware`, `search_intrusion_sets`, `search_attack_patterns`, `search_campaigns`, `search_vulnerabilities`, `search_threat_actors`, `search_tools`, `search_sectors`, `search_reports` |
  | **Relationships** | `malware_by_actor`, `attack_patterns_by_actor`, `exploited_vulnerabilities`, `tools_employed` |
  | **Sector analysis** | `threat_actors_targeting_sector`, `intrusion_sets_targeting_sector` |
  | **TTP analysis** | `tactics_by_actor`, `techniques_by_actor`, `techniques_by_intrusion_set` |
  | **Temporal** | `latest_reports`, `sector_reports`, `actor_mention_reports` |
  | **Profiling** | `malware_used_by_actor`, `campaigns_attributed_to_actor`, `techniques_employed_by_actor` |
  | **Reports** | `report_detail`, `report_malware_mentions`, `report_intrusion_set_references` |

  ## Safety

  - All tools are read-only against the OpenCTI GraphQL API. Even so, gate `search_reports` and `latest_reports` to incident-phase agents only — pulling unrelated reports during quarantine adds noise.
  - The MCP returns `created_by_ref` for every entity. Treat any free-text description from OpenCTI as **untrusted** until your hypothesis agents have cross-checked the source.

  ## Caveats

  - Community-maintained; if upstream goes quiet, swap to `zxzinn/opencti-mcp` by changing the `command`/`args` block — the env-var contract is the same.
  - The MCP queries the OpenCTI GraphQL endpoint; large relationship traversals can be slow on small instances. Use `--limit` flags where the tool exposes them.
  - If your OpenCTI instance enforces 2FA on the user, generate a long-lived token explicitly under the user's API Access page — interactive 2FA won't work for a service connection.
  ````

- [ ] **Step 2: Verify lint + JSON**

  Run:

  ```bash
  npx markdownlint-cli2 "packages/team-incident-response/mcp-recipes/opencti-mcp.md"
  awk '/^```jsonc$/,/^```$/{print}' packages/team-incident-response/mcp-recipes/opencti-mcp.md \
    | sed '1d;$d' | jq -e . > /dev/null && echo "valid JSON"
  ```

  Expected: 0 errors, `valid JSON`.

- [ ] **Step 3: Commit**

  Run:

  ```bash
  git add packages/team-incident-response/mcp-recipes/opencti-mcp.md
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "feat(team-incident-response): add opencti-mcp recipe"
  ```

---

### Task 3: Author `azure-skills-mcp.md` recipe

**Files:**

- Create: `packages/team-incident-response/mcp-recipes/azure-skills-mcp.md`

- [ ] **Step 1: Create the recipe with the exact content below**

  Write to `packages/team-incident-response/mcp-recipes/azure-skills-mcp.md`:

  ````markdown
  # MCP Recipe — azure-skills (Microsoft official plugin)

  Microsoft's official Azure agent plugin — bundles **skills** (Azure expertise + guardrails for prep, validation, deployment, diagnostics, cost optimization, RBAC) with two MCP servers underneath (Azure MCP and Foundry MCP, ~200 tools across 40+ services). This is the higher-level plugin layer. Use it when you want skills + tools together; use the lower-level `azure-mcp` recipe when you only need the raw Azure Resource Manager surface.

  ## Source

  - Repo: <https://github.com/microsoft/azure-skills>
  - License: MIT
  - Maintainer: Microsoft Azure — official

  ## Install

  ### Claude Code

  Inside Claude Code:

  ```
  /plugin install azure@claude-plugins-official
  ```

  Or via `/plugin` → search "azure" in the marketplace.

  ### Codex CLI

  ```bash
  codex plugin marketplace add microsoft/azure-skills
  ```

  Then in Codex: `/plugins` → install `azure`.

  ### Other hosts

  - Cursor: search "azure" in the plugins panel.
  - GitHub Copilot CLI: `gh extension install github/gh-copilot` then `gh copilot plugin install azure`.
  - VS Code GitHub Copilot Chat: install from the marketplace.

  ## Configuration

  The plugin manages its own MCP wiring — there is no JSON snippet to paste into `~/.claude/settings.json`. After install, restart your agent host. Verify with:

  ```
  # In Claude Code
  /mcp list   # Expect "azure" and "foundry" servers listed.
  ```

  ## Auth setup

  The plugin reads Azure credentials from the host environment in this priority order:

  1. **Azure CLI** (preferred for humans):

     ```bash
     az login --tenant <tenant-id>
     az account set --subscription <subscription-id>
     ```

  2. **Azure Developer CLI** (for deployment scenarios):

     ```bash
     azd auth login
     ```

  3. **Service principal env vars** (for CI / headless / opsbench's recommended pattern):

     ```bash
     export AZURE_TENANT_ID="..."
     export AZURE_CLIENT_ID="${AZURE_INCIDENT_SP_CLIENT_ID}"
     export AZURE_CLIENT_SECRET="$(op read 'op://Private/azure-incident-sp/credential')"
     export AZURE_SUBSCRIPTION_ID="..."
     ```

  4. **Managed identity** (when the agent host runs inside Azure — VM, AKS, Container Apps).

  Use the same `Reader` (subscription) + `Key Vault Secrets User` (specific Key Vaults) scope as the `azure-mcp` recipe. Do NOT grant `Contributor` to the SP that backs the agent.

  ## What the plugin surfaces

  - **Skills layer** — workflows like `deploy-an-app`, `diagnose-app-service`, `recommend-rbac`, `estimate-cost`, `validate-template`. These are SKILL.md-format and load alongside opsbench skills (namespace prefix: `azure/...`).
  - **Azure MCP server** — ~200 structured tools across 40+ services: resource inventory, monitoring, pricing, storage, databases, messaging, AKS, App Service, Application Insights, Key Vault, Cosmos, Postgres, MySQL, etc.
  - **Foundry MCP server** — Azure AI Foundry model discovery, deployment, and agent workflows.

  ## Safety

  - Many of azure-skills' tools are **read-write** by default (e.g., `appservice_restart`, `aks_node_drain`). Mirror your opsbench Cedar policy by maintaining a per-agent allowlist that excludes mutation tools unless an incident-commander is in the loop.
  - The plugin auto-runs `bestpractices` checks for Azure-related work; opsbench's hypothesis loop should treat those as recommendations, not directives, and still cite evidence for any deviation.

  ## Caveats

  - This is a **plugin distribution**, not a single binary. Updates flow through the host's plugin marketplace (`/plugin update azure` in Claude Code).
  - On hosts without an Azure account configured, the plugin's tools fail with `EAUTH` — friendlier than silently returning empty data, but worth knowing during initial setup.
  - For Entra ID operations the plugin does NOT replace Microsoft Graph MCP — use Graph MCP separately if Entra ID work is in scope.

  ## See also

  - `azure-mcp.md` — lower-level Azure Resource Manager + Azure Monitor + Key Vault MCP; use when you don't want the skills layer.
  - `k8sgpt-mcp.md` — pair with azure-skills when an incident spans AKS-managed clusters; k8sgpt scopes K8s analyzers, azure-skills scopes the ARM surface around them.
  ````

- [ ] **Step 2: Verify lint (no JSON snippets in this recipe)**

  Run:

  ```bash
  npx markdownlint-cli2 "packages/team-incident-response/mcp-recipes/azure-skills-mcp.md"
  ```

  Expected: 0 errors.

- [ ] **Step 3: Commit**

  Run:

  ```bash
  git add packages/team-incident-response/mcp-recipes/azure-skills-mcp.md
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "feat(team-incident-response): add azure-skills-mcp recipe"
  ```

---

### Task 4: Author `k8sgpt-mcp.md` recipe

**Files:**

- Create: `packages/team-incident-response/mcp-recipes/k8sgpt-mcp.md`

- [ ] **Step 1: Create the recipe with the exact content below**

  Write to `packages/team-incident-response/mcp-recipes/k8sgpt-mcp.md`:

  ````markdown
  # MCP Recipe — k8sgpt-mcp

  k8sgpt's built-in MCP server — exposes K8s cluster analyzers (Pods, Services, Deployments, Ingress, PVCs, Nodes, …) as agent-callable tools. Pairs naturally with `team-incident-response`'s `hypothesis-control-plane` and `hypothesis-storage` agents during K8s investigations.

  ## Source

  - Repo: <https://github.com/k8sgpt-ai/k8sgpt>
  - License: Apache 2.0
  - Maintainer: k8sgpt-ai organization
  - Site: <https://k8sgpt.ai>

  ## Install

  ```bash
  # Linux/macOS
  brew install k8sgpt
  # OR
  curl -LO https://github.com/k8sgpt-ai/k8sgpt/releases/latest/download/k8sgpt_linux_amd64.tar.gz
  tar xf k8sgpt_linux_amd64.tar.gz && sudo mv k8sgpt /usr/local/bin/

  # Verify
  k8sgpt version
  ```

  Configure an LLM backend once (the MCP server uses it for analyzer explanations):

  ```bash
  k8sgpt auth add --backend openai --model gpt-4o
  # or: --backend azureopenai --model <deployment>
  # or: --backend localai (for offline / on-prem)
  ```

  ## Configuration

  ### Stdio mode (recommended for opsbench)

  ```jsonc
  {
    "mcpServers": {
      "k8sgpt": {
        "command": "k8sgpt",
        "args": ["serve", "--mcp", "--anonymize"],
        "env": {
          "KUBECONFIG": "${HOME}/.kube/config-incident"
        }
      }
    }
  }
  ```

  **Note:** `--anonymize` is NOT default upstream — opsbench recommends always passing it so that namespace names, pod names, and labels are masked before any payload is sent to the LLM backend.

  ### HTTP mode (when multiple agent hosts share one MCP)

  Start the server:

  ```bash
  k8sgpt serve --mcp --mcp-http --mcp-port 8089 --anonymize
  ```

  Then in `~/.claude/settings.json`:

  ```jsonc
  {
    "mcpServers": {
      "k8sgpt": {
        "url": "http://localhost:8089"
      }
    }
  }
  ```

  ## Auth setup

  1. Use a dedicated, read-only kubeconfig — not your admin one.

     ```bash
     # Create a ServiceAccount with view permissions on incident namespaces
     kubectl create serviceaccount opsbench-incident -n kube-system
     kubectl create clusterrolebinding opsbench-incident-view \
       --clusterrole=view --serviceaccount=kube-system:opsbench-incident
     # Generate a kubeconfig pointing at that SA's token
     kubectl -n kube-system create token opsbench-incident --duration=8h > /tmp/sa.token
     # ... (use `kubectl config set-credentials` to build ~/.kube/config-incident)
     ```

  2. Verify it's view-only:

     ```bash
     KUBECONFIG=~/.kube/config-incident kubectl auth can-i create pods --all-namespaces
     # Expected: no
     ```

  3. Configure the LLM backend (see Install step above). Prefer a backend with a read-only key dedicated to k8sgpt.

  ## Tools surfaced (12 tools + 3 resources + 3 prompts)

  k8sgpt's MCP currently exposes:

  - **Tools (12):** `analyze` (run all analyzers), `analyze_pods`, `analyze_services`, `analyze_deployments`, `analyze_ingresses`, `analyze_pvcs`, `analyze_nodes`, `analyze_replicasets`, `analyze_statefulsets`, `analyze_cronjobs`, `analyze_networkpolicies`, `explain` (per-issue LLM explanation).
  - **Resources (3):** `cluster_info`, `analyzer_list`, `cache_status`.
  - **Prompts (3):** interactive troubleshooting templates for namespace-, workload-, and node-scoped issues.

  Specific tool names may shift between releases; run `k8sgpt serve --mcp --help` after install to enumerate against your installed version.

  ## Safety

  - Always pass `--anonymize`. Namespace names alone can leak customer identifiers.
  - The MCP shells out to `kubectl` under the hood and will respect whatever permissions the kubeconfig has. Combined with a `view`-only SA, this gives belt-and-suspenders read-only enforcement.
  - Cache analyzer output to S3/Azure Blob/GCS for incidents that span multiple agent sessions — k8sgpt supports `--remote-cache` so subsequent agents don't re-hammer the API server.

  ## Caveats

  - The LLM backend k8sgpt uses for `explain` may be different from your Claude Code backend. Costs accrue against the k8sgpt-configured account.
  - k8sgpt analyzers are best-effort SRE heuristics, not exhaustive failure detection. Treat the output as a *hypothesis*, not a verdict — opsbench's `verdict-arbiter` agent still adjudicates.
  - On clusters with hundreds of namespaces, run targeted analyzers (`analyze_pods` etc.) instead of the catch-all `analyze` to keep latency reasonable.

  ## See also

  - `k8s-mcp.md` — generic kubectl MCP; complements k8sgpt by giving raw access to non-analyzer resources.
  - `azure-skills-mcp.md` — pair when the K8s cluster is AKS-managed.
  ````

- [ ] **Step 2: Verify lint + JSON**

  Run:

  ```bash
  npx markdownlint-cli2 "packages/team-incident-response/mcp-recipes/k8sgpt-mcp.md"
  awk '/^```jsonc$/,/^```$/{print}' packages/team-incident-response/mcp-recipes/k8sgpt-mcp.md \
    | sed '1d;$d' | jq -e . > /dev/null && echo "valid JSON"
  ```

  Expected: 0 errors. **Note:** the file has TWO jsonc blocks; the awk above concatenates them — if you see a parse error, split and check each block individually.

  Robust check:

  ```bash
  awk 'BEGIN{n=0} /^```jsonc$/{n++; capture=1; next} /^```$/{if(capture){capture=0; print "" > "/tmp/block"n".json"; next}} capture{print > "/tmp/block"n".json"}' \
    packages/team-incident-response/mcp-recipes/k8sgpt-mcp.md
  for f in /tmp/block*.json; do jq -e . "$f" >/dev/null && echo "$f: valid"; done
  ```

- [ ] **Step 3: Commit**

  Run:

  ```bash
  git add packages/team-incident-response/mcp-recipes/k8sgpt-mcp.md
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "feat(team-incident-response): add k8sgpt-mcp recipe"
  ```

---

### Task 5: Author `cli-anything-framework.md` recipe

**Files:**

- Create: `packages/team-incident-response/mcp-recipes/cli-anything-framework.md`

- [ ] **Step 1: Create the recipe with the exact content below**

  Write to `packages/team-incident-response/mcp-recipes/cli-anything-framework.md`:

  ````markdown
  # MCP Recipe — cli-anything (framework, not a server)

  `HKUDS/CLI-Anything` is **not** an MCP server — it is a framework that converts any software with source code (or a public CLI) into an agent-callable Click-based CLI plus a SKILL.md file. opsbench documents it here as the recommended fallback whenever a tool you need has no MCP server upstream (e.g. Falco — see the `falco-event-ingest` skill in this package).

  ## Source

  - Repo: <https://github.com/HKUDS/CLI-Anything>
  - License: Apache 2.0
  - Site: <https://clianything.cc/>

  ## When to use

  - The tool you want to expose to a Claude Code agent has a CLI but no MCP server (Falco's `falcoctl`, custom internal tools, vendor utilities that haven't been MCP-ized).
  - You'd rather generate a typed, JSON-emitting wrapper than shell out via `Bash` from inside skills.
  - You want the wrapper to ship with a SKILL.md that opsbench can copy into a team package.

  ## Install

  ```bash
  pip install cli-anything-hub
  # OR (for plugin development against the latest)
  git clone https://github.com/HKUDS/CLI-Anything.git
  ```

  Prerequisites: Python 3.10+, the target tool installed locally (or its source repo cloned), and at least one supported agent host (Claude Code is supported).

  ## How to generate an agent-callable CLI from an existing tool

  Inside Claude Code:

  ```
  /cli-anything ./path/to/target-tool
  # or with a GitHub URL:
  /cli-anything https://github.com/falcosecurity/falcoctl
  ```

  This runs CLI-Anything's 7-phase pipeline:

  1. **Analyze** — scans source code, maps the existing surface.
  2. **Design** — designs command groups and JSON output schemas.
  3. **Implement** — builds the Click CLI with a unified REPL.
  4. **Plan tests** — drafts a test strategy.
  5. **Write tests** — implements the test suite.
  6. **Document** — generates docs.
  7. **Publish** — creates `setup.py`, installs to PATH.

  Output lands in `./<target-tool>/agent-harness/` with the Click CLI, tests, docs, and — most importantly for opsbench — a `skills/cli-anything-<target>/SKILL.md` that Claude Code can pick up.

  ## Agent auto-discovery

  Once you've generated one or more harnesses, register CLI-Anything's hub meta-skill so other agents can discover them:

  ```bash
  npx skills add HKUDS/CLI-Anything --skill cli-hub-meta-skill -g -y
  ```

  This installs a top-level "cli-hub" skill that exposes a `list_available_clis` tool — agents can then query and install CLIs on demand.

  ## Configuration

  No MCP config to write; the generated CLI runs as a normal subprocess from skills via `Bash`. The wrapper CLIs default to JSON output mode (`--json`), which makes their stdout machine-consumable.

  ## opsbench integration pattern

  For any tool `X` we want to expose:

  1. Generate the wrapper: `/cli-anything ./X`.
  2. Copy the generated `skills/cli-anything-X/SKILL.md` into the appropriate team package (e.g., `packages/team-incident-response/skills/X-via-cli-anything/`).
  3. Hand-edit the SKILL.md frontmatter to match opsbench's naming conventions (kebab-case `name:`, opsbench-flavored `description:`).
  4. Document the upstream tool's install prerequisite in the team's MCP recipes index or the skill's `README.md`.
  5. Cite the generated wrapper from any agent that needs to call `X`.

  See `packages/team-incident-response/skills/falco-event-ingest/` for a worked example using Falco + falcosidekick.

  ## Safety

  - The generated CLI inherits the underlying tool's blast radius. Wrap mutation-capable tools (anything that can `apply`, `delete`, `restart`) behind a Cedar policy in `policies/tools.cedar` just like any direct MCP tool.
  - Re-run CLI-Anything's regeneration step whenever the underlying tool's surface changes — wrappers go stale silently otherwise.

  ## Caveats

  - The framework requires Python on the host. For containerized agent setups, build the wrapper into the agent's container image at build time.
  - Generated wrappers are NOT a substitute for a maintained upstream MCP server. If upstream ships one later, prefer it — wrappers are best as the bridge, not the destination.

  ## See also

  - `falco-event-ingest` skill in this package — concrete wiring using CLI-Anything.
  ````

- [ ] **Step 2: Verify lint**

  Run:

  ```bash
  npx markdownlint-cli2 "packages/team-incident-response/mcp-recipes/cli-anything-framework.md"
  ```

  Expected: 0 errors.

- [ ] **Step 3: Commit**

  Run:

  ```bash
  git add packages/team-incident-response/mcp-recipes/cli-anything-framework.md
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "feat(team-incident-response): add cli-anything framework recipe"
  ```

---

### Task 6: Author the `falco-event-ingest` skill

**Files:**

- Create: `packages/team-incident-response/skills/falco-event-ingest/SKILL.md`
- Create: `packages/team-incident-response/skills/falco-event-ingest/templates/falcosidekick.values.yaml.template`
- Create: `packages/team-incident-response/skills/falco-event-ingest/templates/cli-anything-harness.md.template`
- Create: `packages/team-incident-response/skills/falco-event-ingest/templates/README.md`

- [ ] **Step 1: Create the SKILL.md**

  Write to `packages/team-incident-response/skills/falco-event-ingest/SKILL.md`:

  ````markdown
  ---
  name: falco-event-ingest
  description: Ingest Falco runtime-security events into an opsbench incident timeline via falcosidekick → CLI-Anything-generated wrapper. Use when a K8s incident involves syscall-level anomalies, container escapes, suspicious exec calls, file integrity violations, or any other Falco rule firing during the active incident window.
  tools: Bash, Read, Write, Grep, Glob
  ---

  # falco-event-ingest

  Pull recent Falco events out of `falcosidekick` and append them as evidence (with SHA-256 sealing) to the current incident's `timeline.md` and `custody.log`.

  ## When to invoke

  - During incident triage when the cluster runs Falco and the hypothesis-control-plane or hypothesis-storage agents need syscall-level signal.
  - Periodically during the active incident window (typically every 5–10 minutes) as new events accumulate.
  - When a hypothesis explicitly cites a Falco rule (`container_drift`, `terminal_shell_in_container`, `write_below_etc`, etc.) — pull the matching events before authoring the verdict.

  ## Why this is a SKILL, not a recipe

  Falco has no canonical MCP server upstream. The community options either lack licenses or have not been touched in months (see the parent recipe `mcp-recipes/cli-anything-framework.md` for the reasoning). The honest path is:

  1. Use `falcosidekick` (the official Falco companion) to stream Falco events to a webhook.
  2. Use `CLI-Anything` to generate an agent-callable wrapper that reads from that webhook's storage (a local SQLite ring buffer by default).
  3. Have this skill orchestrate the wrapper from inside opsbench, so events land in the incident timeline with chain-of-custody intact.

  When/if `falcosecurity` or CNCF publishes an official Falco MCP, this skill gets replaced by a real recipe and the wrapper retires.

  ## Prerequisites

  - Falco running on the target cluster (DaemonSet, recommended ≥ v0.40).
  - `falcosidekick` installed and configured to write to a local webhook sink (template in this skill's `templates/`).
  - `CLI-Anything` installed on the agent host (`pip install cli-anything-hub`). See `mcp-recipes/cli-anything-framework.md`.
  - The generated wrapper installed at `/usr/local/bin/falco-events` (the harness template names it that — keep the name for the rest of this skill to work).

  ## Workflow

  ### Step 1 — Pull recent events

  ```bash
  falco-events list --since "10m" --json > /tmp/falco-events-$(date -u +%Y%m%dT%H%M%SZ).json
  ```

  ### Step 2 — Filter to incident-relevant events

  Drop events whose `output_fields.k8s_ns` is outside the incident's namespace scope. The incident dir's `scope.json` lists in-scope namespaces; cross-reference:

  ```bash
  jq -c \
    --slurpfile scope "$INCIDENT_DIR/scope.json" \
    '. as $e | $scope[0].namespaces | any(. == $e.output_fields.k8s_ns) | select(.)' \
    /tmp/falco-events-*.json > /tmp/falco-events-scoped.jsonl
  ```

  ### Step 3 — Seal and catalog

  Each scoped event becomes an evidence artifact. The `evidence-cataloger` agent will SHA-256-seal them and append to `custody.log`; this skill just needs to write them to the incident's `evidence/falco/` directory and emit a manifest:

  ```bash
  mkdir -p "$INCIDENT_DIR/evidence/falco"
  while IFS= read -r line; do
    ts=$(echo "$line" | jq -r '.time')
    rule=$(echo "$line" | jq -r '.rule' | tr -c 'a-zA-Z0-9_-' '_')
    f="$INCIDENT_DIR/evidence/falco/${ts}_${rule}.json"
    echo "$line" > "$f"
  done < /tmp/falco-events-scoped.jsonl
  ```

  ### Step 4 — Append timeline entry

  Use the `incident-timeline` skill's `append_event` flow with category `EXTERNAL_EVENT` and actor `falco-event-ingest`. Include a one-line summary per rule:

  ```bash
  rules_seen=$(jq -r '.rule' /tmp/falco-events-scoped.jsonl | sort | uniq -c | awk '{printf "%s (%d)\n", $2, $1}')
  echo "$rules_seen" >> "$INCIDENT_DIR/timeline.md"
  ```

  (The `post-tool-use.sh` hook will auto-seal whatever files were written during this skill's execution — no extra SHA-256 step needed here.)

  ## Outputs

  - `$INCIDENT_DIR/evidence/falco/<timestamp>_<rule>.json` — one file per scoped event.
  - Timeline entries with category `EXTERNAL_EVENT` and a rules-seen summary.

  ## Limits

  - falcosidekick's default ring buffer holds the last 24h of events. For longer incidents, configure it to spill to S3 (see template).
  - The wrapper is regenerated each time Falco rule definitions change; stale wrappers may miss new rule fields.
  - This skill does NOT trigger Falco rule re-evaluation. If you need that, use `kubectl rollout restart ds/falco -n falco` and re-run after a fresh sweep.

  ## See also

  - `mcp-recipes/cli-anything-framework.md` — how the wrapper is generated.
  - `skills/incident-timeline/` — timeline append semantics.
  - `agents/team-3-cataloging/evidence-witness.md` — chain-of-custody attestor that downstream agents consult.
  ````

- [ ] **Step 2: Create the falcosidekick values template**

  Write to `packages/team-incident-response/skills/falco-event-ingest/templates/falcosidekick.values.yaml.template`:

  ```yaml
  # Helm values for falcosidekick that wire events into a local webhook sink
  # that CLI-Anything's generated wrapper reads from.
  #
  # Install:
  #   helm upgrade --install falcosidekick falcosecurity/falcosidekick \
  #     -n falco -f falcosidekick.values.yaml
  #
  # Replace OPSBENCH_WEBHOOK_URL with the URL your CLI-Anything wrapper exposes
  # (default: http://<agent-host>:9988/falco-events).
  
  config:
    debug: false
    customfields: "incident_capable=true"
    webhook:
      address: "OPSBENCH_WEBHOOK_URL"
      method: "POST"
      minimumpriority: "informational"
      checkcert: true
      customheaders: "X-OpsBench-Source: falcosidekick"
  
    # Spill to S3 for incident retention > 24h
    s3:
      bucket: "opsbench-falco-events"
      prefix: "incidents/"
      region: "ap-south-1"
      minimumpriority: "notice"
  
  webui:
    enabled: false   # opsbench does not need the falcosidekick UI
  ```

- [ ] **Step 3: Create the CLI-Anything harness template**

  Write to `packages/team-incident-response/skills/falco-event-ingest/templates/cli-anything-harness.md.template`:

  ````markdown
  # Falco wrapper — HARNESS.md template

  Fed to CLI-Anything to generate a `falco-events` CLI that the `falco-event-ingest`
  skill calls. Replace placeholders before running `/cli-anything`.

  ## Target

  - Tool: `falcosidekick` webhook sink + local SQLite ring buffer
  - Source: this template's sibling `webhook-server.py` (a small FastAPI app — write
    this yourself; CLI-Anything analyzes it to generate the CLI).
  - Output format: JSON lines, one event per line, schema = Falco's standard event.

  ## Generated command surface (target shape)

  ```
  falco-events list   --since DURATION [--rule REGEX] [--namespace NS] [--json|--yaml]
  falco-events latest --rule REGEX
  falco-events stats  [--by rule|namespace|priority]
  falco-events tail   [--follow]
  ```

  All commands MUST emit JSON to stdout when `--json` is set (the default in our
  skill). Non-JSON output is for interactive humans only.

  ## Install path

  Generated harness installs to `/usr/local/bin/falco-events` via `setup.py` →
  `python3 -m pip install ./agent-harness/`.

  ## Validation

  After generation:

  ```bash
  falco-events list --since 1m --json | jq -e 'type=="array"' && echo ok
  ```
  ````

- [ ] **Step 4: Create the templates README**

  Write to `packages/team-incident-response/skills/falco-event-ingest/templates/README.md`:

  ````markdown
  # falco-event-ingest — templates

  These templates wire Falco → falcosidekick → CLI-Anything-generated CLI →
  opsbench skill. They are starting points, not drop-in configs — review and adapt
  for your cluster's auth, retention, and naming conventions.

  | File | Purpose |
  | ---- | ------- |
  | `falcosidekick.values.yaml.template` | Helm values for falcosidekick configured to POST to a local webhook sink. |
  | `cli-anything-harness.md.template`   | HARNESS.md fed to `/cli-anything` to generate the `falco-events` wrapper. |

  See the parent `SKILL.md` for the orchestration logic; see
  `../../mcp-recipes/cli-anything-framework.md` for the wrapper-generation pipeline.
  ````

- [ ] **Step 5: Verify skill frontmatter validates**

  Run:

  ```bash
  bash scripts/validate-skill.sh
  ```

  Expected: `OK <N> skill files validated.` with the new file counted in.

- [ ] **Step 6: Verify lint**

  Run:

  ```bash
  npx markdownlint-cli2 "packages/team-incident-response/skills/falco-event-ingest/**/*.md"
  ```

  Expected: 0 errors.

- [ ] **Step 7: Commit**

  Run:

  ```bash
  git add packages/team-incident-response/skills/falco-event-ingest
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "feat(team-incident-response): add falco-event-ingest skill"
  ```

---

### Task 7: Update `azure-mcp.md` with See-also section

**Files:**

- Modify: `packages/team-incident-response/mcp-recipes/azure-mcp.md`

- [ ] **Step 1: Append the See-also section to the existing recipe**

  Open `packages/team-incident-response/mcp-recipes/azure-mcp.md`. Add the following block at the very end of the file (after the existing `## Caveats` section):

  ````markdown

  ## See also

  - `azure-skills-mcp.md` — Microsoft's higher-level Azure plugin. It bundles
    workflow skills (deployment, diagnostics, RBAC, cost) with two MCP servers
    underneath (Azure MCP and Foundry MCP, ~200 tools across 40+ services).
    Use `azure-skills` when you want the skills layer; use this `azure-mcp`
    recipe when you only need the raw ARM/Monitor/Key Vault surface and want
    tighter control over the JSON config.
  - `k8sgpt-mcp.md` — pair with this recipe when the workload is on AKS;
    `azure-mcp` covers the cluster's surrounding ARM resources, `k8sgpt-mcp`
    covers the in-cluster analyzers.
  ````

- [ ] **Step 2: Verify lint**

  Run:

  ```bash
  npx markdownlint-cli2 "packages/team-incident-response/mcp-recipes/azure-mcp.md"
  ```

  Expected: 0 errors.

- [ ] **Step 3: Commit**

  Run:

  ```bash
  git add packages/team-incident-response/mcp-recipes/azure-mcp.md
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "docs(team-incident-response): cross-link azure-mcp to azure-skills + k8sgpt"
  ```

---

### Task 8: Update `team-incident-response/README.md` counts

**Files:**

- Modify: `packages/team-incident-response/README.md`

- [ ] **Step 1: Find the MCP-recipes row**

  Run:

  ```bash
  grep -n "MCP recipes" packages/team-incident-response/README.md
  ```

  Note the line numbers; the count to change is currently `17`.

- [ ] **Step 2: Update the count from 17 to 22 and add an integrations pointer**

  Edit `packages/team-incident-response/README.md`. Locate the table row that reads (verbatim):

  ```
  | **MCP recipes** | 17 | k8s, Grafana, ClickHouse, Postgres, Slack, PagerDuty, GitHub, Azure, AWS, OpenTelemetry, Velociraptor, eBPF, Longhorn (custom), Contabo (custom), WireGuard (custom) |
  ```

  Replace with:

  ```
  | **MCP recipes** | 22 | k8s, Grafana, ClickHouse, Postgres, Slack, PagerDuty, GitHub, Azure, azure-skills, AWS, OpenTelemetry, Velociraptor, eBPF, k8sgpt, TheHive (EXPERIMENTAL), OpenCTI, CLI-Anything (framework), Longhorn (custom), Contabo (custom), WireGuard (custom) |
  ```

  Below that table (just before the next H2), add this paragraph:

  ```
  See [`../../docs/integrations.md`](../../docs/integrations.md) for the standing inventory of every external project opsbench references — recipe, skill, vendored, or pure cross-link — including license and integration status.
  ```

- [ ] **Step 3: Update the root `README.md` table row too if it carries the same count**

  Run:

  ```bash
  grep -n "MCP recipes" README.md
  ```

  If the root README has the same `17` row, update it to `22` with the same expanded list.

- [ ] **Step 4: Verify lint**

  Run:

  ```bash
  npx markdownlint-cli2 "**/*.md" "#node_modules" "#CHANGELOG.md"
  ```

  Expected: 0 errors.

- [ ] **Step 5: Commit**

  Run:

  ```bash
  git add packages/team-incident-response/README.md README.md
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "docs(team-incident-response): bump MCP-recipe count 17→22; link integrations doc"
  ```

---

### Task 9: Create `docs/integrations.md`

**Files:**

- Create: `docs/integrations.md`

- [ ] **Step 1: Create the file with the exact content below**

  Write to `docs/integrations.md`:

  ````markdown
  # External integrations

  Standing inventory of every external project opsbench references — recipe, skill, vendored, or pure cross-link — with license and integration status.

  Last reviewed: 2026-06-04.

  ## Active integrations (recipes / skills)

  | Project | License | How opsbench uses it | File |
  | ------- | ------- | -------------------- | ---- |
  | [`Azure/azure-mcp`](https://github.com/Azure/azure-mcp) | MIT | Recipe — raw ARM/Monitor/Key Vault MCP | `packages/team-incident-response/mcp-recipes/azure-mcp.md` |
  | [`microsoft/azure-skills`](https://github.com/microsoft/azure-skills) | MIT | Recipe — Azure plugin layer (skills + Azure MCP + Foundry MCP) | `packages/team-incident-response/mcp-recipes/azure-skills-mcp.md` |
  | [`k8sgpt-ai/k8sgpt`](https://github.com/k8sgpt-ai/k8sgpt) | Apache 2.0 | Recipe — K8s diagnostics MCP (built-in `serve --mcp`) | `packages/team-incident-response/mcp-recipes/k8sgpt-mcp.md` |
  | [`StrangeBeeCorp/TheHiveMCP`](https://github.com/StrangeBeeCorp/TheHiveMCP) | MIT | Recipe — TheHive case-management MCP (EXPERIMENTAL upstream) | `packages/team-incident-response/mcp-recipes/thehive-mcp.md` |
  | [`jhuntinfosec/mcp-opencti`](https://github.com/jhuntinfosec/mcp-opencti) | MIT | Recipe — OpenCTI threat-intel MCP (community) | `packages/team-incident-response/mcp-recipes/opencti-mcp.md` |
  | [`HKUDS/CLI-Anything`](https://github.com/HKUDS/CLI-Anything) | Apache 2.0 | Recipe — framework for wrapping tools without MCP servers | `packages/team-incident-response/mcp-recipes/cli-anything-framework.md` |
  | [`falcosecurity/falcosidekick`](https://github.com/falcosecurity/falcosidekick) | Apache 2.0 | Skill prereq — Falco event sink for `falco-event-ingest` | `packages/team-incident-response/skills/falco-event-ingest/` |
  | [`grafana/grafana`](https://grafana.com/) MCP | AGPL-3.0 (server-side) | Recipe — Grafana MCP | `packages/team-incident-response/mcp-recipes/grafana-mcp.md` |
  | [`ClickHouse/ClickHouse`](https://github.com/ClickHouse/ClickHouse) MCP | Apache 2.0 | Recipe — ClickHouse MCP | `packages/team-incident-response/mcp-recipes/clickhouse-mcp.md` |

  *(Existing recipes for AWS, Postgres, Slack, PagerDuty, GitHub, Linear, OpenTelemetry, Velociraptor, eBPF observability, and the three CUSTOM- recipes are listed under `mcp-recipes/` in the team package; see that directory for license and source details on each.)*

  ## Templates / blueprints (used in design, not vendored)

  | Project | License | Influence on opsbench |
  | ------- | ------- | --------------------- |
  | [`Azure/git-ape`](https://github.com/Azure/git-ape) | MIT | Structural template for the upcoming `packages/team-platform-engineering` (Roadmap P4) — `.github/agents/`, `.github/skills/`, and `.github/workflows/` layout informs the team's directory shape. No code vendored. |

  ## Cross-reference only (not integrated)

  These projects are intentionally out of scope today; documented here so future contributors don't re-litigate the decision.

  | Project | Why not integrated | Revisit when… |
  | ------- | ------------------ | -------------- |
  | [`microsoft/hve-core`](https://github.com/microsoft/hve-core) | GitHub Copilot Chat surface; prompt format differs from Claude Code SKILL.md. Methodology (RPI) overlaps with opsbench's hypothesis loop. | A clean Copilot↔Claude Code prompt-format converter exists, OR upstream ships a Claude Code variant. |
  | [`AgentOps-AI/agentops`](https://github.com/AgentOps-AI/agentops) | Python SDK for agent observability (CrewAI/AG2/OpenAI Agents/LangChain). No Claude Code or Codex CLI integration upstream. Would require a Claude-Code-hook shim build. | A Claude Code observability hook shim is in scope (currently tracked as a potential side-quest). |

  ## Deferred for separate evaluation

  | Project | License | Why it deserves its own brainstorming pass |
  | ------- | ------- | ------------------------------------------ |
  | [`sympozium-ai/sympozium`](https://github.com/sympozium-ai/sympozium) | MIT | Kubernetes multi-agent coordination layer by the k8sgpt author. Its skill-sidecar + RBAC + shared-memory model overlaps load-bearing pieces of opsbench (Cedar policies + custody ledger), but it is a K8s-deployed operator, not a file-install. Roadmap item P7. |

  ## How this list is maintained

  - Any PR that adds, replaces, or removes an MCP recipe or external dependency MUST update this file in the same commit.
  - The CI markdownlint job is the safety net for formatting; semantic accuracy is the author's responsibility.
  - Re-review at least quarterly — upstream activity, license changes, and security posture all drift.
  ````

- [ ] **Step 2: Verify lint**

  Run:

  ```bash
  npx markdownlint-cli2 "docs/integrations.md"
  ```

  Expected: 0 errors.

- [ ] **Step 3: Commit**

  Run:

  ```bash
  git add docs/integrations.md
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "docs(repo): add integrations.md standing inventory"
  ```

---

### Task 10: Extend `cspell.json` with the new vocabulary

**Files:**

- Modify: `cspell.json`

- [ ] **Step 1: Add the new words alphabetically into the `words` array**

  Words to add (some may already be present from earlier P0 work — `git grep` first):

  ```
  Cortex
  falcoctl
  falconry
  Filigran
  KNDELETE
  KNOWLEDGE
  KNUPDATE
  observables
  PVCs
  ReplicaSets
  StatefulSets
  CronJobs
  NetworkPolicies
  ```

  Open `cspell.json` and add any not already present, maintaining alphabetical order within the `words` array.

- [ ] **Step 2: Verify cspell passes on the new files**

  Local cspell may need Node 22 (cspell v10). If the local environment cannot run it, this verification happens in CI. Lefthook will block commits when `cspell` is in `LEFTHOOK_EXCLUDE`.

  If Node 22 is available locally:

  ```bash
  npx --yes cspell --no-progress --no-must-find-files \
    "packages/team-incident-response/mcp-recipes/thehive-mcp.md" \
    "packages/team-incident-response/mcp-recipes/opencti-mcp.md" \
    "packages/team-incident-response/mcp-recipes/azure-skills-mcp.md" \
    "packages/team-incident-response/mcp-recipes/k8sgpt-mcp.md" \
    "packages/team-incident-response/mcp-recipes/cli-anything-framework.md" \
    "packages/team-incident-response/skills/falco-event-ingest/**/*.md" \
    "docs/integrations.md"
  ```

  Expected: `Issues found: 0 in 0 files`.

- [ ] **Step 3: Commit**

  Run:

  ```bash
  git add cspell.json
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "docs(repo): extend cspell dictionary for P1 recipes + Falco skill"
  ```

---

### Task 11: Full-repo lint sweep before PR

- [ ] **Step 1: markdownlint everything**

  Run:

  ```bash
  npx markdownlint-cli2 "**/*.md" "#node_modules" "#CHANGELOG.md"
  ```

  Expected: 0 errors.

- [ ] **Step 2: shellcheck (no shell scripts were added, but rerun for safety)**

  Run:

  ```bash
  bash -c 'shopt -s globstar nullglob; mapfile -t files < <(find scripts tools packages -type f -name "*.sh" 2>/dev/null); shellcheck "${files[@]}"'
  ```

  Expected: exit 0.

- [ ] **Step 3: JSON schema sanity (no new schemas, just rerun)**

  Run:

  ```bash
  npx --yes -p ajv-cli@5 -p ajv-formats ajv compile --spec=draft2020 -c ajv-formats \
    -s "packages/*/schemas/*.json"
  ```

  Expected: all 9 schemas `valid`, exit 0.

- [ ] **Step 4: validate-skill + validate-agent**

  Run:

  ```bash
  bash scripts/validate-skill.sh
  bash scripts/validate-agent.sh
  ```

  Expected: both report `OK ... files validated.`

---

### Task 12: Push and open the PR

- [ ] **Step 1: Push**

  Run:

  ```bash
  git push -u origin feat/p1-mcp-recipes-and-falco-skill
  ```

- [ ] **Step 2: Open the PR**

  Run (heredoc preserves formatting):

  ````bash
  gh pr create --base main --head feat/p1-mcp-recipes-and-falco-skill \
    --title "feat(team-incident-response): add 5 MCP recipes + falco-event-ingest skill" \
    --body "$(cat <<'EOF'
  ## Summary

  Implements P1 from \`docs/superpowers/specs/2026-06-04-multi-phase-execution-roadmap.md\` per the design at \`docs/superpowers/specs/2026-06-04-p1-mcp-recipes-design.md\`.

  - **Five new MCP recipes** under \`packages/team-incident-response/mcp-recipes/\`:
    - \`thehive-mcp.md\` — TheHive case-management MCP; **EXPERIMENTAL banner**, \`PERMISSIONS_CONFIG=read_only\` default.
    - \`opencti-mcp.md\` — OpenCTI threat-intel MCP via the community jhuntinfosec server (zxzinn fallback documented).
    - \`azure-skills-mcp.md\` — Microsoft's official Azure plugin (skills + Azure MCP + Foundry MCP).
    - \`k8sgpt-mcp.md\` — k8sgpt's built-in MCP (\`serve --mcp\`); recommends \`--anonymize\`.
    - \`cli-anything-framework.md\` — HKUDS/CLI-Anything framework recipe for wrapping tools that lack MCP servers.
  - **New skill** \`packages/team-incident-response/skills/falco-event-ingest/\` substituting for the missing canonical Falco MCP — wires Falco → falcosidekick → CLI-Anything-generated wrapper → incident timeline.
  - **Updated** \`azure-mcp.md\` with a See-also section cross-linking azure-skills and k8sgpt.
  - **New** \`docs/integrations.md\` — standing inventory of every external project opsbench references.
  - **Bumped** team README MCP-recipe count 17 → 22.
  - **Extended** \`cspell.json\` with new domain vocabulary.

  ## Test plan

  - [x] markdownlint clean across all touched files
  - [x] cspell clean (new vocabulary added)
  - [x] JSON snippets in recipes parse with \`jq\`
  - [x] \`scripts/validate-skill.sh\` counts the new \`falco-event-ingest\` skill
  - [x] No changes to schemas, agents, or hooks — JSON-schema-validate, shellcheck unaffected
  - [ ] Reviewer agrees TheHive recipe's EXPERIMENTAL banner is loud enough
  - [ ] Reviewer agrees the \`falco-event-ingest\` skill's "no canonical MCP" reasoning is appropriate
  EOF
  )"
  ````

  Capture the PR URL the command returns — that is the handoff point to the next sub-project (P2).

- [ ] **Step 3: Wait for CI green, then merge**

  Wait for all CI checks (markdownlint, cspell, yamllint, shellcheck, json-schema-validate, skill+agent frontmatter, installer dry-run, cedar-validate, CodeQL, analyze) to complete. Then:

  ```bash
  gh pr merge <pr-number> --squash
  ```

  Once merged, switch back to main:

  ```bash
  git checkout main && git pull origin main --ff-only && git branch -D feat/p1-mcp-recipes-and-falco-skill
  ```

---

## Self-review checklist

After completing all tasks above:

- [ ] Every spec requirement has a task: 5 recipes (T1–T5), 1 skill (T6), azure-mcp cross-link (T7), README updates (T8), integrations doc (T9), cspell extension (T10), lint sweep (T11), PR (T12). ✓
- [ ] TheHive recipe has EXPERIMENTAL banner + `PERMISSIONS_CONFIG=read_only` default (per user amendment). ✓
- [ ] No placeholders, no "TBD", no "implement similar to". ✓
- [ ] Every recipe ships the same section structure: Source → Install → Configuration → Auth → Tools surfaced → Safety → Caveats → See also. ✓
- [ ] `docs/integrations.md` lists every project the spec touches, plus deferred items. ✓
- [ ] PR title and body match the spec's "Sequencing & PR layout" section. ✓
- [ ] Each task's commit message uses the right Conventional Commit scope (`feat(team-incident-response)`, `docs(team-incident-response)`, `docs(repo)`) — see existing repo history for examples. ✓
