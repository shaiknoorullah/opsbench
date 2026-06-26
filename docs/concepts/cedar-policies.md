# Cedar policies

opsbench uses [Cedar](https://www.cedarpolicy.com/) — the open-source policy language originally from AWS — to gate every agent action outside the model's reasoning loop. Deny is the default; an action is allowed only when an explicit `permit` matches and no `forbid` overrides it.

## Why Cedar (not OPA / Rego)

- **Boundedly evaluable.** Cedar is intentionally not Turing-complete — evaluation is fast and analyzable.
- **Designed for fine-grained authorization** — exactly the shape ops teams need for per-tool, per-action gating.
- **Schema-aware.** Policies are validated against an entity schema, so a typo in an action name or a reference to a non-existent attribute fails the build instead of silently mis-authorizing.

## Where they live

```
packages/<team>/policies/cedar/opsbench.cedarschema   # the canonical schema (contract)
packages/<team>/policies/cedar/tools.cedar            # per-tool-call authorization
packages/<team>/policies/governors.cedar              # loop / round-boundary governors
packages/<team>/policies/cedar/validate.mjs           # the gate (CI + lefthook)
packages/<team>/policies/constitution.md              # tone law (separate, see tone-and-constitution)
```

## The canonical model

Every authorization request — built by the hook at runtime and validated against `opsbench.cedarschema` — has this shape:

| Part | Type | Example | Notes |
| ---- | ---- | ------- | ----- |
| **principal** | `Agent::"<name>"` | `Agent::"recovery-executor"` | the calling subagent's real `name:` frontmatter, or `Agent::"human-operator"` |
| **action** | `Action::"<ns>::<verb>"` | `Action::"k8s::scale"`, `Action::"FS::append"` | classified by the hook from the tool + its args |
| **resource** | `Resource::"<id>"` + attrs | attrs: `path`, `namespace`, `command_class`, `exec_user`, `repo`, `read_only` | attributes carried in the entities file |
| **context** | record | `human_approval`, `verdict_status`, `recovery_step_id`, `recovery_step_risk`, … | derived by the hook from incident state |

Governors use the same principal/action grammar with a `Incident::"<id>"` resource and a `LoopContext` (rounds, budgets, wall-clock, staleness).

### Fail-safe rule: guard every optional attribute with `has`

All resource and context attributes are **optional** — a given call only populates what applies to it. Policies must guard each access:

```cedar
permit (
  principal == Agent::"forensic-synthesizer",
  action    == Action::"FS::write",
  resource
) when {
  resource has path && (
    resource.path like "*/round-*/verdict.md" ||
    resource.path like "*/round-*/synthesis.md"
  )
};
```

Without the `has` guard, accessing a missing attribute raises an evaluation error; Cedar *skips* an erroring policy, which would silently drop a `permit` (default-deny) **or** a `forbid` (fail-open). Guarding makes a missing attribute deterministically fail safe. Strict schema validation (`cedar validate`) enforces this.

### Matching several agents

Cedar's `in` scope operator takes a single entity/group, **not** a set — `principal in [Agent::"a", Agent::"b"]` is invalid. Rules that apply to several agents use an unconstrained principal plus a `contains` guard:

```cedar
permit ( principal, action == Action::"FS::read", resource )
when {
  [Agent::"hypothesis-storage", Agent::"hypothesis-network"].contains(principal) &&
  resource has path && resource.path like "*/round-*/evidence/*"
};
```

## Gating model

```
agent ─tool call─▶ PreToolUse hook ─▶ classify (action+resource+context) ─▶ cedar authorize ─▶ allow|deny
orchestrator ─round boundary─▶ governor-check.sh ─▶ cedar authorize (governors.cedar) ─▶ allow|deny
```

- **`hooks/pre-tool-use.sh`** maps the Claude Code `tool_name` + `tool_input` to an `(Agent, Action, Resource, Context)` request and calls the `cedar` CLI. See [Hooks](hooks.md).
- **`hooks/lib/governor-check.sh`** evaluates `governors.cedar` for loop/recovery transitions (`loop::new_round`, `loop::dispatch_collection`, `recovery::execute`, …) — these are orchestration decisions, not tool calls, so they are checked by the orchestrator, not the per-tool hook.

## Validation (the gate is real)

`policies/cedar/validate.mjs` runs the **real Cedar engine** (`@cedar-policy/cedar-wasm`) to:

1. parse `opsbench.cedarschema`,
2. strict-validate `tools.cedar` and `governors.cedar` against it,
3. assert a battery of allow/deny decisions (e.g. *recovery-executor may scale only with a CONFIRMED verdict + human approval*; *no agent may edit a hook or policy*).

It runs in CI (`.github/workflows/ci.yml`, job **cedar policy gate + hook tests**) and on commit via lefthook, and fails the build on any error. Run it locally:

```bash
npm run validate:cedar     # schema + policies + decision battery
npm run validate:hooks     # bats tests for the hook logic
```

## Authoring policies

1. Start from default-deny.
2. Declare any new action or resource/context attribute in `opsbench.cedarschema` first.
3. Add one `permit` per (agent, action class, resource shape) tuple; guard every optional attribute with `has`.
4. Express mutation gates as **permits that require** the gating context (`human_approval`, `verdict_status`) — so an absent signal yields no permit → deny. Use `forbid … unless` for defense-in-depth.
5. Run `npm run validate:cedar` — it must pass before the policy is accepted.
