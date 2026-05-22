# Team-Debugger Hypothesis Prompt Template

Fill the placeholders. Pass the resulting text as `prompt:` to `Agent(subagent_type: "agent-teams:team-debugger", ...)`.

---

## Hypothesis {{H_ID}}: {{HYPOTHESIS_HEADLINE}}

At **{{UTC_TIMESTAMP}}** {{ONE_LINE_FAILURE_DESCRIPTION}}.

The hypothesis you are investigating: **{{ONE_SENTENCE_MECHANISM_CLAIM}}**

## Context (do not re-discover)

- {{KEY_FACT_1}}
- {{KEY_FACT_2}}
- {{KEY_FACT_3}}
- The window of interest is {{TIMESTAMP_MINUS_5MIN}} to {{TIMESTAMP_PLUS_5MIN}}.

## What to investigate

**Primary evidence sources** (commands ready to copy-paste):

1. **{{SOURCE_NAME_1}}**:
```
{{COMMAND_1}}
```
Look for: {{WHAT_TO_LOOK_FOR_1}}

2. **{{SOURCE_NAME_2}}**:
```
{{COMMAND_2}}
```
Look for: {{WHAT_TO_LOOK_FOR_2}}

3. **{{SOURCE_NAME_3}}**:
```
{{COMMAND_3}}
```
Look for: {{WHAT_TO_LOOK_FOR_3}}

## What would CONFIRM this hypothesis

- {{CONFIRM_EVIDENCE_1}}
- {{CONFIRM_EVIDENCE_2}}

## What would FALSIFY this hypothesis

- {{FALSIFY_EVIDENCE_1}}
- {{FALSIFY_EVIDENCE_2}}

## Discipline

- Cite exact file paths and timestamps from logs
- Distinguish what you OBSERVED from what you INFER
- Report confidence as HIGH / MEDIUM / LOW / INCONCLUSIVE
- If evidence is AGAINST this hypothesis, say so clearly — do NOT bend findings to fit
- This is **read-only**. NO mutations.

## Report format

```
## {{H_ID}} Verdict

**Confidence:** [HIGH | MEDIUM | LOW | INCONCLUSIVE]
**Status:** [CONFIRMED | LIKELY | UNLIKELY | FALSIFIED]

### Evidence FOR
- <log path>:<timestamp> — "<verbatim excerpt>"
- ...

### Evidence AGAINST
- <log path>:<timestamp> — "<verbatim excerpt>"
- ...

### Key timestamps
- HH:MM:SS — <what happened>
- ...

### What we still don't know
- ...
```

## Connection details (for SSH-based investigation)

- {{HOST_1}}: `ssh -i {{KEY}} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@{{IP_1}}`
- {{HOST_2}}: `ssh -i {{KEY}} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@{{IP_2}}`
- kubectl context: `{{KUBECTL_CONTEXT}}`
