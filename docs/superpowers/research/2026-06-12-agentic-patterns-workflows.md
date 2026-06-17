# Patterns, Workflows & Agentic Practices (synthesis)

> Part 3 of 4 of the "Agent Ecosystems for DevOps & Security/Networking" practitioner reference (input corpus for the Opsbench Platform research on branch `research/enterprise-agentops-platform`). Current as of May 2026.

Sources: [Anthropic Cookbook managed_agents](https://github.com/anthropics/claude-cookbooks/tree/main/managed_agents); [Pulumi blog "The Claude Skills I Actually Use for DevOps" (2026)](https://www.pulumi.com/blog/top-8-claude-skills-devops-2026/); [Pulumi "How Building AI Agents Has Changed in 2026"](https://www.pulumi.com/blog/how-building-ai-agents-has-changed/); [trailofbits/claude-code-config](https://github.com/trailofbits/claude-code-config); [obra/superpowers SKILL.md](https://github.com/obra/superpowers/blob/main/skills/using-superpowers/SKILL.md); [obra/superpowers writing-skills/SKILL.md](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md); [Flavius Dinu, "18 Best DevOps MCP Servers for 2026 — The Definitive Guide" (k8slens / Medium, April 2026)](https://medium.com/k8slens/18-best-devops-mcp-servers-for-2026-the-definitive-guide-bfde04654a35); [Cloudshipai 2026 MCP guide](https://www.cloudshipai.com/blog/mcp-servers-devops-complete-guide-2026); [Fly.io docs — "WireGuard tunnels and Flycast"](https://fly.io/docs/mcp/access-control/flycast/); [InfoWorld "10 MCP servers for devops"](https://www.infoworld.com/article/4096223/10-mcp-servers-for-devops.html); [tldrsec.com #316](https://tldrsec.com/p/tldr-sec-316).

## 1. Skills vs MCPs vs Sub-agents — the mental model

Pulumi's mechanic analogy is canonical: **MCPs are wrenches and lifts; skills are the SOPs/manuals; sub-agents are other specialist mechanics** the lead delegates to. From the Pulumi blog: *"Skills teach Claude how to think about things. Different jobs. They get more useful when you combine them."*

- **Skill** = behavioral instructions + reference content. Progressive disclosure: only the ~100-token description loads at startup; body loads on demand.
- **MCP** = external tool surface. Live data, external mutations.
- **Sub-agent** = forked context window. Independent reasoning; only the summary returns to the parent session.

**Cost reality (verbatim from [Pulumi 2026](https://www.pulumi.com/blog/top-8-claude-skills-devops-2026/)):** *"the GitHub MCP alone eats 46,000 tokens across 91 tools before you type anything. Cursor eventually capped MCPs at 40 tools because too many options made everything worse."*

## 2. Progressive disclosure for skills

From [obra/superpowers writing-skills/SKILL.md](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md): *"When a description summarizes the skill's workflow, Claude may follow the description instead of reading the full skill content. A description saying 'code review between tasks' caused Claude to do ONE review, even though the skill's flowchart clearly showed TWO reviews."* Keep descriptions trigger-focused, not workflow-summarizing.

## 3. Hypothesis-driven debugging loops

The Superpowers `systematic-debugging` skill formalizes hypotheses, then tests, instead of fishing. Pair with `root-cause-tracing` for upward traces toward true cause.

## 4. The "Verification Before Completion" Iron Law

Superpowers' `verification-before-completion` skill activates *before* declaring work done. Stop hooks enforce this; per Trail of Bits' [claude-code-config](https://github.com/trailofbits/claude-code-config) docs, Stop hooks are *"a chance to say 'you're not done yet.'"*

## 5. Evidence-based RCA

`lyndonkl/claude` `causal-inference-root-cause` skill: *"Systematically investigates causal relationships to identify true root causes rather than correlations or symptoms"* — Bradford Hill criteria, DAGs of confounders, tests competing explanations, outputs scored against a JSON rubric (minimum 3.5). Pair with [`awesome-skills/5-whys-skill`](https://github.com/awesome-skills/5-whys-skill) for cheap-first-pass.

## 6. Multi-agent orchestration (orchestrator + executor + reviewer)

Dominant pattern across [wshobson/agents](https://github.com/wshobson/agents) (16 multi-agent orchestrators), [obra/superpowers](https://github.com/obra/superpowers) (subagent-driven-development), and [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) (100+ specialized subagents). Roles:

- **Orchestrator** — chooses route; minimal tool access.
- **Executors** — write code; full edit tools.
- **Reviewer(s)** — read-only (`Read, Grep, Glob`); spec-compliance review and code-quality review run as **two distinct passes** (per Superpowers).

## 7. Sandbox / least-privilege patterns for prod access

Pattern from [Cloudshipai 2026 guide](https://www.cloudshipai.com/blog/mcp-servers-devops-complete-guide-2026): self-host every MCP; credentials never leave your network. Use stdio transport for production operations (terraform apply, DB migrations). Store MCP configs in Git for PR review. Verbatim: *"The key insight: With self-hosted MCP, a jailbreak can only access what YOUR security policies allow. With SaaS, a jailbreak gets everything you uploaded."*

Trail of Bits' [dropkit](https://github.com/trailofbits/claude-code-config) pattern: spin a disposable DigitalOcean droplet with Tailscale + pre-installed Claude Code, run autonomously, destroy when done.

## 8. PagerDuty webhook → agent → PR (Anthropic SRE cookbook)

The canonical implementation: [`managed_agents/sre_incident_responder.ipynb`](https://github.com/anthropics/claude-cookbooks/tree/main/managed_agents). Five stages:

1. PagerDuty V3 webhook → `client.beta.sessions.create`.
2. Agent reads logs, identifies failure signature.
3. Agent edits infra-repo file in place, produces unified `diff -u`.
4. `open_pull_request(title, body, diff)` + `request_approval(summary)` → session idles.
5. On `"approved"`, `merge_pull_request(pr_number)`. Otherwise stop and report.

System prompt verbatim: *"Never call merge_pull_request unless request_approval returned 'approved'. Keep the fix minimal — do not refactor unrelated config."*

## 9. Read-only first, then scoped writes

Universal advice. From Flavius Dinu's [k8slens "18 Best DevOps MCP Servers for 2026"](https://medium.com/k8slens/18-best-devops-mcp-servers-for-2026-the-definitive-guide-bfde04654a35): *"Whenever you are adopting a new MCP server, start with read-only permissions, and scope access carefully before giving write access to production systems."*

Flag examples: `grafana/mcp-grafana --disable-write`, `containers/kubernetes-mcp-server --read-only`, Datadog official MCP read-only by default. Pattern: roll out to staging with write enabled before granting prod write scope.

## 10. Skill composition examples

From Superpowers: `brainstorming → write-plan → execute-plan → verification-before-completion → systematic-debugging → 5-whys → root-cause-tracing`. Each skill activates automatically by description match. Composition is enabled by SessionStart context injection + the skills-search tool.

## 11. Context window management (avoiding MCP tool sprawl)

Cursor's 40-MCP-tool cap is the canonical case study. From [Pulumi 2026](https://www.pulumi.com/blog/how-building-ai-agents-has-changed/): *"A hundred tools meant a heavy system prompt before the agent had thought about anything. The skills pattern flips that."*

Tactical guidance:

- Disable categories you don't use (`mcp-grafana --disable-oncall`, `--disable-navigation`).
- Use the `enabled-tools` allowlist instead of `disable-*` denylists.
- Prefer a search-tools meta-tool when the suite is large (`us-all/datadog-mcp-server` ships this for 159 tools).

## 12. Git worktrees for parallel agent work

Pattern in [obra/superpowers](https://github.com/obra/superpowers): launch parallel subagents on per-module worktrees so they don't trample each other. Combined with the `agent-teams` plugin in [wshobson/agents](https://github.com/wshobson/agents) — state machine (`todo → review → done`), auto-retry, inter-agent messaging.

## 13. Approval gates and human-in-the-loop

Anthropic Managed Agents: the `request_approval` custom tool sets session status to `awaiting_user`. The webhook event `session.status_idled` pings your app; engineer reviews diff in Anthropic Console; on approve, loop resumes and executes `merge_pull_request`. Per Instagit's [summary](https://instagit.com/anthropics/claude-cookbooks/building-sre-incident-response-agent-claude-managed-agents/): *"dangerous operations (like merging to main) receive explicit sign-off."*

## 14. Runbook-as-skill

From Anthropic's SRE cookbook: *"Skills are markdown files that tell the agent when and how to apply domain-specific procedures."* Encode OOM/CrashLoopBackOff/ImagePullBackOff patterns as `SKILL.md` files alongside fixture log → manifest → runbook triples.

## 15. Chaos engineering for fix validation

`chaos-engineer` skill in [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) generates fault-injection plans, asks the orchestrator to inject failure and validate new behavior before merging. Pair with `verification-before-completion`.

## 16. The Monday SLO review pattern (Confluent / Grafana)

Schedule a weekly session that queries Grafana SLO state, Datadog SLO snapshots, and incident postmortems via MCP. Agent emits a structured Markdown report and (optionally) opens a Jira ticket for any SLO with <50% error budget remaining.

## 17. TDD with agents for infrastructure code

Superpowers' `test-driven-development` skill extended to infra: write failing connectivity tests / policy assertions, then iterate. Tools: `cilium connectivity test`, `helm test`, `tflint`, `checkov` — driven through the agent.

## 18. Blameless postmortem generation

`incident-responder` agent + Confluence MCP (in Anthropic SRE example) produces structured postmortems: timeline, contributing factors, action items. The cookbook explicitly mocks a Confluence space for postmortems (`CONFLUENCE_SPACE_KEY=SRE`).

## 19. Sub-agent dispatch (parallel agents for module-scoped work)

From [`trailofbits/claude-code-config`](https://github.com/trailofbits/claude-code-config): `/review-pr` — *"Reviews a GitHub PR with parallel agents (pr-review-toolkit, Codex, Gemini), fixes findings, and pushes."* `/merge-dependabot` — *"batches overlapping PRs, evaluates each in parallel (build, test, matrix gap analysis), and merges passing PRs sequentially with post-merge re-testing."*

## 20. Anti-patterns to avoid

- **Skill sprawl.** Hundreds of overlapping skills the orchestrator picks badly between. Mitigation: TDD your skills (Superpowers writing-skills RED-GREEN-REFACTOR).
- **MCP token bloat.** Every tool costs input tokens before the user types. Use categorical disable flags, not denylists.
- **AI-generated causal percentages.** `lyndonkl/claude` `causal-inference-root-cause` skill explicitly guards against "60% of incidents are network-related" hand-waved percentages — requires evidence column and Bradford Hill criteria.
- **Auto-merge without verification.** Anthropic cookbook Iron Law: never merge until `request_approval` returns `"approved"`.
- **Trusting unvetted skills.** `trailofbits/skills-curated` README: *"Published skills have been found with backdoors and malicious hooks, and the ecosystem has no built-in quality gate. This repo is how we solve that problem internally. Everything here has been code-reviewed by Trail of Bits staff."* Use a vetted marketplace.
- **Putting MCP on the public internet.** From [Fly.io docs "WireGuard tunnels and Flycast"](https://fly.io/docs/mcp/access-control/flycast/): *"The best way not to let randos on the internet access to your MCP server is to not put the MCP server on the internet in the first place."*
