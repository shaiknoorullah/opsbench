# Adding a skill

A skill is a high-level orchestration entry point that the user invokes (via `/skill-name` in Claude Code). Skills compose subagents.

## Steps

1. Pick the team package: `packages/team-<slug>/`.
2. Create a directory: `packages/team-<slug>/skills/<skill-name>/`.
3. Create `SKILL.md` with the [skill frontmatter](../concepts/skill-format.md):

   ```yaml
   ---
   name: <skill-name>
   description: <one-line summary>
   version: 0.1.0
   ---
   ```

4. Write the skill body. Use the conventions in [Skill format](../concepts/skill-format.md).

5. If the skill produces artifacts, add a JSON Schema under `packages/team-<slug>/schemas/`.

6. If the skill dispatches subagents that need new permissions, update the Cedar policy under `packages/team-<slug>/policies/cedar/`.

7. Add the new skill to the team's README table.

8. Validate locally:

   ```bash
   bash scripts/validate-skill.sh
   ```

9. Open a PR. CI will run frontmatter validation + linting.

## Reviewer checklist

Reviewers check that:

- Frontmatter is well-formed.
- The skill body has Overview, When to use, Procedure, Outputs sections.
- Any new tool/MCP usage is reflected in Cedar policy.
- The skill respects the [constitution](../concepts/tone-and-constitution.md) (no forbidden words; no autonomous mutation).
- Artifacts referenced have schemas.
