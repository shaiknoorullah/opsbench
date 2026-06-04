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
