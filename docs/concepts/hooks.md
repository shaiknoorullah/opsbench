# Hooks

Claude Code exposes lifecycle hooks: `SessionStart`, `PreToolUse`, `PostToolUse`, `SubagentStop`, `Stop`. opsbench teams ship hook scripts under `packages/<team>/hooks/` that enforce:

- **PreToolUse** — Cedar authorization; reject the call if no `permit` matches.
- **PostToolUse** — schema validation on `Write`; tone-review (forbidden-words grep); citation check.
- **SessionStart** — load team constitution into context; assert env (jq, cedar CLI, …).
- **SubagentStop** — finalize per-round artifacts (e.g. seal evidence hash; close timeline entry).

## Registration

After install, the user patches `~/.claude/settings.json` to register the hook scripts:

```json
{
  "hooks": {
    "PreToolUse":   "$CLAUDE_HOME/hooks/opsbench/team-incident-response/pre-tool-use.sh",
    "PostToolUse":  "$CLAUDE_HOME/hooks/opsbench/team-incident-response/post-tool-use.sh",
    "SubagentStop": "$CLAUDE_HOME/hooks/opsbench/team-incident-response/subagent-stop.sh",
    "SessionStart": "$CLAUDE_HOME/hooks/opsbench/team-incident-response/session-start.sh"
  }
}
```

The installer prints this snippet at the end of its run.

## Composing multiple teams

When more than one team is installed, each team's hooks live under a separate directory (`hooks/opsbench/<team>/`). The Claude Code `hooks` map only takes one path per event — to chain, point each event at a dispatcher script (a future opsbench feature; today, choose one team's hook chain per session).

## Authoring hooks

- All hook scripts use `#!/usr/bin/env bash`, `set -euo pipefail`.
- Hooks must not block on network — pre-fetch any caches in SessionStart.
- Hooks must be idempotent on repeated invocation.
- Hooks should fail closed (deny the call) on internal error, not fail open.
