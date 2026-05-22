# Tone and constitution

The **constitution** is a set of authoring rules every team must follow. The reference document is `packages/team-incident-response/policies/constitution.md`. New teams adapt these rules to their domain.

## Universal rules

- **Forbidden words.** The word "probable" is banned from forensic artifacts without explicit user permission. Forensic conclusions are CONFIRMED, FALSIFIED, NEED-MORE-EVIDENCE, or INCONCLUSIVE — never "probable."
- **No emojis** in committed artifacts unless the user explicitly asks.
- **Plain English in customer-facing comms.** Internal post-mortems may use jargon.
- **Every claim cited.** A claim without a `file:timestamp` citation is a rumor.
- **No autonomous mutation.** Human approval at every round boundary.

## Enforcement

Three layers:

1. **Skill-level instruction.** Skills tell agents to follow the constitution.
2. **tone-reviewer subagent.** Reviews every artifact pre-write; revises against principles (Constitutional AI pattern).
3. **PostToolUse hook.** Greps for forbidden words on `Write` and rejects the call if present.

## Team-specific extensions

A team may add rules in its own constitution file — e.g. a security team might forbid emitting attacker IPs to artifacts that get shared externally; a network team might require all topology assertions to be backed by `ip route`/`ip link` output.

The base rules in `packages/team-incident-response/policies/constitution.md` are conservative defaults; teams extend, they don't relax.
