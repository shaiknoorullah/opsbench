# Goldmine Repositories — Opinionated, Must-Install

> Part 4 of 4 of the "Agent Ecosystems for DevOps & Security/Networking" practitioner reference (input corpus for the Opsbench Platform research on branch `research/enterprise-agentops-platform`). Star counts and signals current as of May 2026 where verifiable; flagged when not visible from search snippets.

## Tier 1 — Install today

### 1. [obra/superpowers](https://github.com/obra/superpowers) + [marketplace](https://github.com/obra/superpowers-marketplace) + [skills](https://github.com/obra/superpowers-skills) + [lab](https://github.com/obra/superpowers-lab) + [developing-for-claude-code](https://github.com/obra/superpowers-developing-for-claude-code)

- **Maintainer:** Jesse Vincent (Prime Radiant). Available in the official Claude plugin marketplace.
- **Why a goldmine:** The canonical agentic-skills framework. Cross-tool: Claude Code, Codex CLI/App, Factory Droid, Gemini CLI, OpenCode, Cursor, GitHub Copilot CLI. 20+ battle-tested skills + `/brainstorm`, `/write-plan`, `/execute-plan` commands + skills-search tool + SessionStart context injection.
- **Key skills:** `brainstorming`, `writing-skills` (the meta-skill — RED-GREEN-REFACTOR for skill authoring), `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `root-cause-tracing`, `condition-based-waiting`.
- **Install (Claude Code):** `/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers@superpowers-marketplace`. Also installable from Anthropic's official marketplace as `superpowers@claude-plugins-official`.
- **Caveat:** Codex support is experimental. Skills override base behavior — read [using-superpowers/SKILL.md](https://github.com/obra/superpowers/blob/main/skills/using-superpowers/SKILL.md) before delegating critical paths.

### 2. [trailofbits/skills](https://github.com/trailofbits/skills) + [skills-curated](https://github.com/trailofbits/skills-curated) + [claude-code-config](https://github.com/trailofbits/claude-code-config)

- **Maintainer:** Trail of Bits (security firm); CC-BY-SA 4.0.
- **Why a goldmine:** 30 plugins, 10 categories; every PR code-reviewed; sidecar `.codex/skills/` for Codex compatibility. Security-grade hooks/skills; `skills-curated` is the answer to backdoored skills in the wild.
- **Key contents:** `building-secure-contracts`, `entry-point-analyzer`, `constant-time-analysis` (already discovered an ML-DSA timing side-channel), CodeQL Security skill, Semgrep rule authoring, `pr-review-toolkit` parallel-agent review pattern, `/merge-dependabot` slash command.
- **Install:** `claude plugin marketplace add trailofbits/skills` then `claude plugin marketplace add trailofbits/skills-curated`. Codex: `git clone … ~/.codex/trailofbits-skills && ~/.codex/trailofbits-skills/.codex/scripts/install-for-codex.sh`.
- **Caveat:** Smart-contract-heavy; skip blockchain plugins if irrelevant.

### 3. [anthropics/skills](https://github.com/anthropics/skills) — 137k stars / 16.2k forks (verified)

- **Maintainer:** Anthropic; Apache 2.0.
- **Why a goldmine:** The reference standard. Includes `skill-creator` (build/test/optimize skills), `mcp-builder` (generate MCP servers), `webapp-testing`, `pdf` / `docx` / `pptx` / `xlsx` document skills (source-available, power Claude.ai's doc capabilities), `brand-guidelines`, `internal-comms`, `slack-gif-creator`, `theme-factory`, `web-artifacts-builder`.
- **Install:** `/plugin install document-skills@anthropic-agent-skills`, `/plugin install example-skills@anthropic-agent-skills`. Use the Skills API for Claude API integration.
- **Caveat:** Some skills are source-available (not Apache); check `LICENSE` per skill.

### 4. [anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks) — especially `managed_agents/` and `claude_agent_sdk/`

- **Maintainer:** Anthropic.
- **Why a goldmine:** Single best reference for production agent architecture. [`claude_agent_sdk/03_The_site_reliability_agent.ipynb`](https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/03_The_site_reliability_agent.ipynb) is the canonical SRE-agent recipe; [`managed_agents/sre_incident_responder.ipynb`](https://github.com/anthropics/claude-cookbooks/tree/main/managed_agents) is the PagerDuty-webhook-to-PR-with-approval flow. Also `CMA_operate_in_production.ipynb` (vaults, webhooks, MCP toolsets), `CMA_orchestrate_issue_to_pr.ipynb`, data-analyst + Slack-bot examples.
- **Usage:** Clone, set `ANTHROPIC_API_KEY` (+ `GITHUB_TOKEN` for some), `jupyter notebook`.
- **Caveat:** Notebooks use mock fixtures (PagerDuty, GitHub, Datadog) — swap for real services per the "Going Further" sections.

### 5. [grafana/mcp-grafana](https://github.com/grafana/mcp-grafana) + siblings

- **Maintainer:** Grafana Labs (official).
- **Why a goldmine:** Most production-vetted observability MCP. Grafana Cloud + OSS, OAuth, RBAC scoping; on-behalf-of token plumbing; OnCall, Sift, Incident, Pyroscope toolsets; Image Renderer integration; SSE + Streamable HTTP transports; `--disable-write` mode. Companion repos: [`grafana/loki-mcp`](https://github.com/grafana/loki-mcp), [`grafana/tempo-mcp-server`](https://github.com/grafana/tempo-mcp-server), [`grafana/mcp-k6`](https://github.com/grafana/mcp-k6), [`grafana/grafana-ui-mcp-server`](https://github.com/grafana/grafana-ui-mcp-server).
- **Install:** `docker run --rm -i -e GRAFANA_URL=… -e GRAFANA_SERVICE_ACCOUNT_TOKEN=… grafana/mcp-grafana -t stdio`. Use `uvx` for zero-install if `uv` present.
- **Caveat:** Read-only mode is the only safe production default until each tool is audited.

### 6. [containers/kubernetes-mcp-server](https://github.com/containers/kubernetes-mcp-server) — 1.5k stars

- **Maintainer:** Marc Nuri / Red Hat (moved to `containers/` org in July 2025); Apache 2.0.
- **Why a goldmine:** Native Go directly against the Kubernetes API — not a kubectl shell-out. Single binary, multi-cluster, multi-arch; KubeVirt + Kiali + Helm toolsets; built-in MCP Prompts (`cluster_health_check`, etc.). Helm chart at `oci://ghcr.io/containers/charts/kubernetes-mcp-server`.
- **Install (Claude Code):** `claude mcp add kubernetes -- npx kubernetes-mcp-server@latest`. For production, use a dedicated ServiceAccount with read-only RBAC per [docs/getting-started-kubernetes.md](https://github.com/containers/kubernetes-mcp-server/blob/main/docs/getting-started-kubernetes.md).
- **Caveat:** `--read-only` + scoped ServiceAccount = prod default.

### 7. [hashicorp/terraform-mcp-server](https://github.com/hashicorp/terraform-mcp-server)

- **Maintainer:** HashiCorp (official).
- **Why a goldmine:** Real-time Terraform Registry access, HCP Terraform / TFE workspace CRUD, Sentinel policies, 35+ tools, OTel metrics, AGENTS.md sample, AWS Marketplace listing. Stacks support in recent releases.
- **Install:** `docker run -i --rm hashicorp/terraform-mcp-server:0.5.2`. For TFE: pass `TFE_TOKEN` + `TFE_ADDRESS`.
- **Caveat:** Intended for local use; with Streamable HTTP, set `MCP_ALLOWED_ORIGINS` to prevent DNS-rebinding. `ENABLE_TF_OPERATIONS=true` for destructive plan/apply (opt-in).

### 8. [pulumi/agent-skills](https://github.com/pulumi/agent-skills) + [Pulumi MCP](https://www.pulumi.com/docs/ai/mcp-server/)

- **Maintainer:** Pulumi (official).
- **Why a goldmine:** Cross-tool — works in Claude Code, Cursor, Copilot, Codex, Junie, Gemini CLI via the universal `npx skills add` CLI. Three plugin groups: migration (Terraform / CDK / ARM / CloudFormation → Pulumi), authoring (components, ESC, best-practices, provider-upgrade), delegation (Pulumi Neo handoff).
- **Install:** `claude plugin marketplace add pulumi/agent-skills` then `claude plugin install pulumi-authoring` / `pulumi-migration` / `pulumi-delegation`. Or `npx skills add pulumi/agent-skills --skill '*'`.
- **Caveat:** Pair the MCP server (read-only registry access) with the skills (authoring patterns).

### 9. [wshobson/agents](https://github.com/wshobson/agents)

- **Maintainer:** William Hobson.
- **Why a goldmine:** 185 specialized agents, 153 skills, 100 commands, 80 plugins, 16 orchestrators. Native Gemini CLI extension support. Built-in evaluation framework (`plugin-eval`) with quick / standard / certify depths.
- **Key plugins:** `python-development` (16 skills), `kubernetes-operations` (4 deployment skills), `cloud-infrastructure` (4 cloud skills), `security-scanning`, `comprehensive-review`, `full-stack-orchestration`, `agent-teams`, `conductor`.
- **Install:** `/plugin marketplace add wshobson/agents` then `/plugin install voltagent-infra` (or specific plugin).

### 10. [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents)

- **Maintainer:** VoltAgent.
- **Why a goldmine:** 100+ subagents across 10 categories; clean tool-permission model (read-only reviewers vs. code writers vs. documentation agents). Includes `incident-responder`, `devops-engineer`, `kubernetes-specialist`, `cli-developer`. Plugin marketplace with `voltagent-infra` collection.
- **Install:** `claude plugin marketplace add VoltAgent/awesome-claude-code-subagents` then `claude plugin install voltagent-infra` (or `voltagent-lang`, `voltagent-meta`).
- **Caveat:** Some agents have prescriptive personas with bespoke "communication protocols" — adapt rather than adopt blindly.

## Tier 2 — Install for specific layers

### 11. [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — 313 skills as of v2.7.3

- **Maintainer:** Alireza Rezvani. Cross-tool: Claude Code, OpenAI Codex, Gemini CLI, OpenClaw, Hermes Agent, Cursor, Aider, Windsurf, Kilo Code, OpenCode, Augment, Antigravity.
- **Why a goldmine:** Largest single multi-tool skill library — 12 domains, 46+ agents, 60+ slash commands, ~402 Python automation tools (stdlib only). C-level advisory personas + `engineering-team/senior-devops`, `senior-sre`, `senior-secops`, `aws-solution-architect`, `mdr-745-specialist`.
- **Install:** `/plugin marketplace add alirezarezvani/claude-skills` then `/plugin install engineering-skills@claude-code-skills`. Cross-tool: `./scripts/gemini-install.sh`.

### 12. [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) — 9.2k stars / 772 forks (verified)

- **Maintainer:** Jeff Allan.
- **Why a goldmine:** 66 cross-tool skills with progressive disclosure done right (description triggers, references on demand). Strong DevOps: `devops-engineer`, `sre-engineer`, `kubernetes-specialist`, `chaos-engineer`, `monitoring-expert`, `database-optimizer`, `postgres-pro`. Docs at jeffallan.github.io/claude-skills.
- **Install:** `npx skills add https://github.com/jeffallan/claude-skills --skill devops-engineer` (per-skill granularity).
- **Caveat:** Personas overlap; pick the right one rather than installing all.

### 13. [ahmedasmar/devops-claude-skills](https://github.com/ahmedasmar/devops-claude-skills)

- **Maintainer:** Ahmed Asmar.
- **Why a goldmine:** Focused DevOps marketplace — `iac-terraform`, `k8s-troubleshooter`, `aws-cost-optimization`, `ci-cd`, `gitops-workflows`, `monitoring-observability`. Cost-optimization plugin ships 6 automated analysis scripts. Self-reports ~120 min saved per use.
- **Install:** `/plugin marketplace add ahmedasmar/devops-claude-skills` + `/plugin install iac-terraform@devops-skills`.

### 14. [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit)

- **Maintainer:** Rohit Ghumare.
- **Why a goldmine:** "Most comprehensive toolkit" — 135 agents, 35 curated skills (+400,000 via SkillKit), 42 commands, 176+ plugins, 20 hooks, 15 rules, 7 templates, 14 MCP configs, 26 companion apps, 52 ecosystem entries. Includes `agents/infrastructure/terraform-engineer.md`, `templates/claude-md/monorepo.md`.
- **Install:** Interactive installer clones repo + symlinks configs.
- **Caveat:** Big. Pick what you need rather than installing wholesale.

### 15. Discovery lists

- [rohitg00/awesome-devops-mcp-servers](https://github.com/rohitg00/awesome-devops-mcp-servers)
- [WagnerAgent/awesome-mcp-servers-devops](https://github.com/WagnerAgent/awesome-mcp-servers-devops) (most categorized)
- [agenticdevops/awesome-devops-mcp](https://github.com/agenticdevops/awesome-devops-mcp)
- [derisk-ai/awesome-devops-mcp-servers](https://github.com/derisk-ai/awesome-devops-mcp-servers)

**Why a goldmine:** Discovery layer. Use these to find layer-specific MCPs and triangulate which are production-ready vs. experimental.

### 16. [Eyadkelleh/awesome-claude-skills-security](https://github.com/Eyadkelleh/awesome-claude-skills-security)

- **Maintainer:** Eyad Kelleh.
- **Why a goldmine:** Security-testing toolkit packaged from SecLists. Plugins: `security-fuzzing`, `security-passwords`, `security-patterns`, `security-payloads`, `security-usernames`, `security-webshells`, `llm-testing`. Includes `bug-bounty-hunter` agent.
- **Install:** `/plugin marketplace add Eyadkelleh/awesome-claude-skills-security` then install plugins individually.
- **Caveat:** Authorized use only — repo README is emphatic: *"Always verify you have proper authorization before conducting security testing."*

### 17. [BehiSecc/awesome-claude-skills](https://github.com/BehiSecc/awesome-claude-skills)

- **Maintainer:** BehiSecc (author of the VibeSec skill).
- **Why a goldmine:** Security-tilted curated awesome list. Featured: `VibeSec-Skill` (IDOR/XSS/SQLi/SSRF/weak-auth), `defense-in-depth`, `ffuf_claude_skill`, `owasp-security` (OWASP 2025 + ASVS 5.0 + Agentic AI 2026), Trail of Bits CodeQL/Semgrep, `varlock-claude-skill`, `sanitize` (15-category PII redaction), `ironclaw-agent-guard` (prompt-injection / risky tool-call review).

### 18. [gl0bal01/malware-analysis-claude-skills](https://github.com/gl0bal01/malware-analysis-claude-skills)

- **Maintainer:** gl0bal01.
- **Why a goldmine:** Most fleshed-out DFIR-adjacent suite. 1 orchestrator + 5 sub-skills: `malware-triage`, `malware-dynamic-analysis`, `specialized-file-analyzer` (Office macros, PDFs, scripts, HTA, disk images, ELF, .lnk), `detection-engineer` (YARA/Sigma/Suricata + IOC defanging), `malware-report-writer`. Optional VirusTotal + abuse.ch MCP integrations.
- **Install:** `npx skills add gl0bal01/malware-analysis-claude-skills`.
- **Caveat:** Does not cover deep static reverse engineering (Ghidra/IDA Pro). Run Claude Code on the host with evidence exported from an isolated VM (malware VMs are typically air-gapped; Claude Code needs network).

### 19. [lyndonkl/claude](https://github.com/lyndonkl/claude) — `causal-inference-root-cause`

- **Maintainer:** lyndonkl.
- **Why a goldmine:** 218-skill personal library. The [`causal-inference-root-cause` skill](https://github.com/lyndonkl/claude/blob/main/skills/causal-inference-root-cause/SKILL.md) is the best public anti-correlation RCA skill — uses DAGs, Bradford Hill criteria, outputs scored against `rubric_causal_inference_root_cause.json` (minimum 3.5). Triggers on "root cause, causal chain, confounding, spurious correlation."
- **Caveats:** Sprawling library; cherry-pick. Other notable skills: `abstraction-concrete-examples`, `layered-reasoning`, `systems-thinking-leverage`, `forecast-premortem`, `scout-mindset-bias-check`.

### 20. [awesome-skills/5-whys-skill](https://github.com/awesome-skills/5-whys-skill)

- **Maintainer:** `awesome-skills` org (8 repos; siblings: `first-principles-skill`, `mermaid-syntax-skill`, `code-review-skill`).
- **Why a goldmine:** Cheapest-first-pass RCA skill. SKILL.md (~1170 words) + references for Toyota Production System origins + software patterns + worked examples (payment outage, latency regression). Outputs a structured "Why Chain" table with an **evidence column** + Immediate/Short-term/Long-term countermeasures.
- **Install:** `git clone https://github.com/tt-a1i/5-whys-skill.git && cp -r 5-whys-skill ~/.claude/plugins/superclaude/skills/5-whys` (upstream is `tt-a1i/5-whys-skill`; the `awesome-skills` org-version is a rehost/fork).
- **Caveat:** Auto-trigger phrase list is broad ("debug this issue", "why did this happen") — may activate on routine debugging prompts.

### 21. [geored/sre-skill](https://github.com/geored/sre-skill)

- **Maintainer:** Gjorgji Georgievski (Red Hat); Apache 2.0.
- **Why a goldmine:** Tight, TDD-built single skill (`debugging-kubernetes-incidents`) with `tests/scenarios.yaml` covering 6 test scenarios. Designed as a contribution template for the Konflux CI skills repository.
- **Caveat:** Tiny community signal (1 star, 1 fork at time of survey). Useful as a template/example, not yet a battle-tested library.

### 22. [AlabamaMike/forensic-skills](https://github.com/AlabamaMike/forensic-skills)

- **Maintainer:** AlabamaMike.
- **Why a goldmine:** 11 skills + 2 slash commands for **code forensics** (NOT DFIR) inspired by Adam Tornhill's *Your Code as a Crime Scene*: `forensic-hotspot-finder` (4–9× defect correlation), `forensic-knowledge-mapping` (bus factor), `forensic-change-coupling`, `forensic-complexity-trends`, `forensic-refactoring-roi`, `forensic-onboarding-risk`, `forensic-debt-quantification`.
- **Caveat:** **Misnomered**: this is git-history tech-debt archaeology, not digital forensics. For DFIR see `gl0bal01/malware-analysis-claude-skills`.

### 23. Discovery / curation lists

- [karanb192/awesome-claude-skills](https://github.com/karanb192/awesome-claude-skills) — self-described "definitive collection of 50+ verified Awesome Claude Skills"
- [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) — Skills-vs-MCP-vs-Subagents decision matrix
- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) — business-ops leaning
- [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) — longstanding general Claude Code awesome list

### 24. Official MCP catalogs

- [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) — official reference MCP servers (`git`, `filesystem`, `fetch`, `memory`, etc.)
- [TensorBlock/awesome-mcp-servers](https://github.com/TensorBlock/awesome-mcp-servers) — comprehensive community catalog organized by infrastructure / observability / databases.

## How to use these together — recommended starter stack

1. **Install:** `obra/superpowers` (workflow discipline) + `anthropics/skills` (reference standard) + `trailofbits/skills-curated` (vetted external skills).
2. **Add MCPs in this order (read-only first):**
   - `containers/kubernetes-mcp-server` with `--read-only` + dedicated ServiceAccount.
   - `grafana/mcp-grafana` with `--disable-write`.
   - `hashicorp/terraform-mcp-server` (read-only registry by default).
   - GitHub MCP Server (PR + issues).
3. **Add domain skills:** `Jeffallan/claude-skills` (`devops-engineer` + `sre-engineer` + `kubernetes-specialist`); `pulumi/agent-skills`; `ahmedasmar/devops-claude-skills` `k8s-troubleshooter`.
4. **For incident response** — fork the Anthropic SRE Incident Responder cookbook; wire PagerDuty → MCP → PR → approval → merge.
5. **For security** — Trail of Bits suite + `gl0bal01/malware-analysis-claude-skills` (DFIR) + `Eyadkelleh/awesome-claude-skills-security` (authorized pentest).
6. **Run agents sandboxed.** Trail of Bits `dropkit` ephemeral droplets, or stdio-only local MCPs. Never expose MCP servers to the public internet ("The best way not to let randos on the internet access to your MCP server is to not put the MCP server on the internet in the first place." — [Fly.io docs](https://fly.io/docs/mcp/access-control/flycast/)).
