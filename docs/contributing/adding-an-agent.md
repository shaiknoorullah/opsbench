# Adding a subagent

Subagents are narrow workers a skill dispatches. They have one goal, an explicit tool allowlist, and a schema-validated output.

## Steps

1. Pick the team and sub-team: `packages/team-<slug>/agents/<sub-team>/`.
2. Create `<agent-name>.md` with [agent frontmatter](../concepts/agent-format.md):

   ```yaml
   ---
   name: <agent-name>
   description: <one-line summary>
   tools: [Read, Bash]
   mcp: [mcp__grafana__loki_query]
   output_schema: schemas/<artifact>.schema.json
   cedar_policy: policies/cedar/tools.cedar
   ---
   ```

3. Write the agent prompt body. Follow the conventions in [Agent format](../concepts/agent-format.md):
   - Role
   - Inputs
   - Procedure (with CONFIRM/FALSIFY criteria if it's a hypothesis agent)
   - Output (schema reference + example)
   - Tool budget

4. If the agent introduces a new artifact type, add the schema under `packages/team-<slug>/schemas/`.

5. Add a `permit` rule in the Cedar policy for the agent's tools.

6. Update the parent skill to reference the new agent.

7. Validate locally:

   ```bash
   bash scripts/validate-agent.sh
   ```

8. Open a PR.

## Reviewer checklist

- Frontmatter has `name`, `description`, `tools`.
- The tool allowlist is minimal (least privilege).
- Output schema exists and the agent body produces matching JSON.
- Cedar policy has a matching `permit` (no other agent's permit should accidentally cover this one).
