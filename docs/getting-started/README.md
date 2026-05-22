# Getting started

## Prerequisites

- Claude Code installed: <https://docs.claude.com/en/docs/claude-code>
- `git`, `curl`, `jq`, `tar` available on `PATH`
- An existing `~/.claude/` directory (Claude Code creates this on first run)

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/shaiknoorullah/opsbench/main/scripts/install.sh | bash
```

Want to preview first:

```bash
curl -fsSL https://raw.githubusercontent.com/shaiknoorullah/opsbench/main/scripts/install.sh | bash -s -- --dry-run
```

## Wire up hooks

Edit `~/.claude/settings.json` and add the per-team hook scripts under `hooks`. The installer prints the exact snippet at the end of its run. Example:

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

## Verify

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/shaiknoorullah/opsbench/main/scripts/doctor.sh)
```

## First incident response

From Claude Code:

```
> /storage-incident-response
```

This invokes the master orchestrator skill for the incident-response team.
