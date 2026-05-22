# Adding a team

Teams are the unit of release in opsbench. A new team gets its own package under `packages/team-<slug>/`.

## Process

1. **RFC.** Open a [new-team proposal issue](../../.github/ISSUE_TEMPLATE/new-team-proposal.yml). Describe discipline, target users, initial skill/agent list, standards, owners. Wait for maintainer acceptance ([Governance](../../GOVERNANCE.md)).

2. **Scaffold.**

   ```bash
   bash scripts/new-team.sh team-<slug>
   ```

   This creates the skeleton: `skills/`, `agents/`, `schemas/`, `policies/`, `hooks/`, `mcp-recipes/`, plus `README.md` and `package.json`.

3. **Author.** Add skills ([Adding a skill](adding-a-skill.md)) and agents ([Adding a subagent](adding-an-agent.md)).

4. **Schemas.** Define every artifact your team produces under `packages/team-<slug>/schemas/`.

5. **Policies.** Write `policies/constitution.md` (extends the universal constitution) and `policies/cedar/tools.cedar` for least-privilege gating.

6. **Hooks.** Author `hooks/pre-tool-use.sh`, `hooks/post-tool-use.sh`, `hooks/subagent-stop.sh`, `hooks/session-start.sh`. Mirror the incident-response team's layout.

7. **MCP recipes.** Add one recipe per third-party MCP server your team integrates with.

8. **Configuration plumbing.**
   - Add the team slug to `commitlint.config.cjs` `scope-enum`.
   - Add the team owner to `.github/CODEOWNERS`.
   - Add a row to the **Teams** table in the root [README](../../README.md).

9. **Docs.** Add `docs/teams/<slug>/README.md` (use [`docs/teams/_template.md`](../teams/_template.md)).

10. **PR.** Open one PR per team. CI must pass.

## Conventions

- One sub-team per concern (e.g. command, evidence collection, analysis, enforcement, authoring, recovery).
- Default-deny Cedar.
- Schema-validate every artifact.
- Tone-review every artifact.
- Document standards explicitly — link to NIST / ISO / ITIL / OWASP / CIS / vendor SOPs.

## Anti-patterns

- A team with one giant skill and no agents → that's a skill, not a team.
- Agents with `tools: [*]` → least-privilege violated.
- Schemas with `additionalProperties: true` everywhere → drift unmonitored.
- Hook scripts that fail open → security regression.
