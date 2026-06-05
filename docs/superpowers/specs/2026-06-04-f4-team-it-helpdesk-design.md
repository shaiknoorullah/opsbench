# F4 — team-it-helpdesk — Design

**Status:** draft 2026-06-04 — awaiting reviewer approval
**Author:** Claude Code session (Shaik Noorullah, driver)
**Parent roadmap:** [`./2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md) (F4 section, team 5/5)
**Sibling team specs:** `team-platform-engineering`, `team-security-response`, `team-network-operations`, `team-data-platform` (companion F4 specs).
**Foundation it rides on:**

- F1 — Cedar-for-agents adoption (provides `policies/tools-generated.cedar` per recipe so this package only ships hand-overrides, not full allowlists).
- F2 — `opsbench-gateway` (every MCP recipe in this package points at the gateway by default; direct-connection paths are documented but not the recommended posture).
- F3 — Signed receipts (every agent action emits an Ed25519-signed `receipts.jsonl` line; the verifier CLI is the auditor's tool of record for "who reset that password / who unenrolled that laptop").

## 1. Purpose

team-it-helpdesk is opsbench's IT-operations team package: the agent surface that runs the day-to-day workplace-technology tasks that absorb most of an internal help-desk team's wall-clock time. Identity lifecycle (joiner / mover / leaver, MFA resets, group membership, conditional-access break-glass), endpoint management (Intune / Jamf enrollment, compliance triage, remote wipe / lock, software push), productivity-suite administration (M365 mailbox / SharePoint / Teams policy, Google Workspace user / drive / group operations), and the everyday ticket-driven workflows that connect them (password reset, license assignment, MFA re-registration, shared mailbox grant, calendar delegate, Zoom / Slack / Okta provisioning out of the same JML event).

Where `team-incident-response` is "stop-the-bleeding for production systems", this team is "keep-the-lights-on for the workforce". The blast radius profile is different — a wrongly-applied conditional-access policy can lock out an entire division; a fat-fingered "delete user" can vaporise mailbox + OneDrive + Teams membership in one call — so the Cedar posture leans heavily on read-by-default, write-with-explicit-allow, and human-in-the-loop for any operation that touches more than one principal at a time.

The package is intentionally thin because F1 generates the per-recipe allowlists from each MCP's tool manifest, F2 evaluates policy + emits custody at the gateway, and F3 signs every entry. team-it-helpdesk contributes the IT-specific skills, agent classes, schemas, hand-overrides, and Pi-first authoring scaffolding; everything else is inherited from the foundation.

## 2. Scope

### In-scope

- Package skeleton under `packages/team-it-helpdesk/` mirroring `team-incident-response/`'s layout (skills/, agents/, schemas/, policies/, mcp-recipes/, hooks/, README.md, package.json, teams/).
- A coherent skill set (target 12) covering the JML lifecycle, MFA / password / break-glass operations, endpoint enrollment + compliance + remote actions, M365 + Google Workspace administration, ticket triage, and the cross-cutting "change-window aware" runner that gates risky writes.
- An agent inventory (target 11 classes across 4 sub-team buckets) that maps cleanly onto the skills and onto Cedar allowlist principals.
- JSON schemas (4) that shape the artifacts the agents produce and consume (request envelope, identity-action receipt, endpoint-action receipt, license-change record).
- A small hand-written Cedar overlay (`policies/cedar/tools.cedar`) that codifies the "always-deny", "two-person-approval", and "principal-cardinality" rules that the F1 generator cannot express from a tool manifest alone.
- A curated MCP-recipe subset — references only, plus thin per-recipe operational notes for this team's use case. We do not duplicate the recipes that live in `team-incident-response/mcp-recipes/`; we cross-link.
- Team-specific hooks (Pre/PostToolUse, SubagentStop) that add IT-helpdesk-shaped checks on top of the foundation's hooks (e.g. "writes against `Microsoft Graph / users` API outside change window → emit a custody marker and block").
- Pi-first authoring docs — every skill ships a `~/.pi/agent/AGENTS.md` snippet first, with Claude Code parity as a secondary section, per the F-series cross-cutting principle.

### Out-of-scope

- The recipes themselves — they live in F0 / `team-incident-response/mcp-recipes/` and are referenced here. We add IT-helpdesk-flavoured operational notes inside a `team-it-helpdesk/mcp-recipes/notes/` directory; we do not vendor recipe files.
- IAM CRUD against the underlying directories. We talk to identity providers through their MCPs (Microsoft Graph MCP, Okta MCP, Keycloak admin-MCP). We do not implement raw SCIM clients.
- HR-system integration (Workday, BambooHR, Personio) for trigger events. Joiner / mover / leaver events arrive as `request.v1` envelopes from upstream automation (ticketing system, HR webhook). Building that upstream connector is F6 territory.
- Phone / softphone provisioning (RingCentral, Dialpad). These would be a tertiary skill set; deferred to a future minor revision.
- Hardware asset tracking and shipping logistics. The endpoint skills know about enrollment and lifecycle from Intune / Jamf's perspective; they do not talk to Snipe-IT, GoCodes, etc.
- Procurement and license purchase. License assignment is in-scope; "buy more licenses" is not.
- Mass communications / broadcast emails. Those belong in a future `team-internal-comms` package.

## 3. Skill inventory

12 skills, named with the `it-` prefix to make them grep-distinct from `incident-` and `evidence-` skills shipped by sibling teams. Each skill lives under `packages/team-it-helpdesk/skills/<skill-name>/SKILL.md` with a `description` frontmatter following the same shape as team-incident-response.

| # | Skill | One-line description |
| - | ----- | -------------------- |
| 1 | `it-identity-jml-orchestrator` | Drive a joiner / mover / leaver event end-to-end across identity provider, M365 / Workspace, endpoint, and downstream SaaS, emitting a single request.v1 envelope per JML event and tracking per-target action receipts to completion. |
| 2 | `it-mfa-reset` | Safely re-register a user's MFA factors after lost device / locked account, walking through identity-provider re-enrollment, fallback codes, conditional-access bypass, and audit emission. Always-two-person-approval for privileged-role principals. |
| 3 | `it-password-rotation` | Force or self-service a password reset, including service accounts, with rotation-frequency awareness and Vault-MCP-backed propagation for non-interactive credentials. |
| 4 | `it-break-glass-conditional-access` | Time-boxed conditional-access policy override with mandatory expiry, reason capture, and a "rollback" pre-scheduled action. Cedar policy enforces max 2 hours, max 1 active grant per directory. |
| 5 | `it-endpoint-enrollment` | Walk a new device through Intune (Windows / Android) or Jamf (macOS / iOS) enrollment, validate compliance profiles, push baseline apps, and confirm reporting heartbeat. |
| 6 | `it-endpoint-compliance-triage` | Investigate why a managed device is non-compliant (encryption, OS version, MDM-agent heartbeat, jailbreak / root posture). Read-only by default; emits a remediation plan as artifact rather than executing it. |
| 7 | `it-endpoint-remote-action` | Execute remote-lock / remote-wipe / remote-restart / app-uninstall / configuration-profile-deploy. Write-heavy; mandatory two-person approval for wipe, mandatory ticket reference for lock. |
| 8 | `it-m365-mailbox-admin` | Manage Exchange Online mailbox — shared-mailbox creation, delegate grants, litigation hold, mailbox restore-from-soft-deleted, calendar permissions. Bulk operations explicitly forbidden by Cedar. |
| 9 | `it-m365-sharepoint-teams` | SharePoint site / library access changes, Teams ownership / membership / policy, sensitivity labelling. Heavy emphasis on least-privilege "grant" and tamper-evident "revoke". |
| 10 | `it-google-workspace-admin` | Google Workspace user / group / drive / calendar admin, with parity coverage of the M365 skills for orgs that run dual-stack. Shares the same Cedar posture. |
| 11 | `it-license-assignment` | Assign / unassign M365, Workspace, Adobe, Atlassian, Zoom, Slack, GitHub Enterprise, Okta licenses based on role-template, with cost-aware bulk preview ("this change adds 14 seats at $X / month — confirm"). |
| 12 | `it-ticket-triage-router` | Read a ticket / request, classify it into the appropriate skill bucket above, gather missing fields, and route to the orchestrator. The "front door" skill — most agents start here. |

### Skill design notes

- Every skill has the same artifact contract: it returns a `request.v1` envelope on entry (so it can be re-driven idempotently) and a typed receipt schema on each completion event (identity-action / endpoint-action / license-change).
- "Read-only by default" means the skill ships in a mode where any tool call that mutates is wrapped by a `confirm:` step that emits a planned-change artifact and requires explicit re-invocation with `--apply` to mutate. The Cedar overlay backstops this — if the skill misbehaves, the gateway denies the write.
- `it-ticket-triage-router` is the only skill expected to be invoked autonomously on inbound webhooks; the others are typically invoked by an agent that has classified the work.
- **Idempotency keys.** Every skill computes an idempotency key from `request_id` + skill-specific deterministic salt and embeds it in every tool call. The gateway's F2 custody layer dedupes by key, so a re-driven skill never double-applies a change. This matters most for `it-identity-jml-orchestrator` and `it-license-assignment` where a partial failure is normal and the runner is expected to resume.
- **Skill composition rules.** Skills *only* call other skills via a gateway-routed sub-agent invocation; direct in-process imports between skills are forbidden so each skill's Cedar principal is independently auditable. `it-identity-jml-orchestrator` calls `it-license-assignment` as a sub-agent — not as a function — and the custody log records both principals.
- **`--explain` mode.** Each skill exposes an `--explain` flag that prints the planned tool calls in human-readable form before any tool is invoked. Operators use this to walk through high-blast-radius operations (break-glass, mass JML, license drift) before granting `--apply`.
- **Failure mode contract.** Skills return one of three terminal states: `applied` (every mutation landed and was custody-signed), `partial` (some mutations landed; receipt enumerates which), `aborted` (no mutations landed). The `partial` state always emits a continuation artifact a follow-up agent can pick up — IT-helpdesk operations interleave with humans, so resumption is a first-class state.
- **Side-effect labelling.** Each skill's SKILL.md frontmatter carries a `side_effects:` list (`identity.write`, `endpoint.write`, `license.write`, `mailbox.write`, etc.). Hooks read this to decide whether to require the change-window or the two-person gate. Read-only skills declare `side_effects: []` so the hook can fast-path them.

## 4. Agent inventory

11 agent classes spread across 4 sub-team buckets. Each agent class declares its tool allowlist *by Cedar principal name* — the actual rule set is generated by F1 from the recipes it consumes; this package adds only the hand-written overrides in § 6.

### team-1-front-door

The triage / routing tier. Reads requests, classifies, routes.

| Class | Capability | Default Cedar allowlist (by recipe) |
| ----- | ---------- | ----------------------------------- |
| `helpdesk-router` | Reads inbound requests (ticket webhook, HR feed, chat slash-command), classifies into the JML / MFA / endpoint / mailbox / license buckets, and dispatches to the appropriate orchestrator. Read-only against ticketing + chat. | `linear-mcp` (read), `slack-mcp` (read), `pagerduty-mcp` (read), `github-mcp` (read — for issue-based requests) |
| `helpdesk-intake-clarifier` | Stateless follow-up agent. Asks the requester for missing structured fields when the router could not classify with confidence. Bounded to chat / ticketing read+comment. | `slack-mcp` (read, post-comment), `linear-mcp` (read, comment) |

### team-2-identity

The JML / auth / break-glass tier. Heaviest blast radius in the package.

| Class | Capability | Default Cedar allowlist (by recipe) |
| ----- | ---------- | ----------------------------------- |
| `jml-orchestrator` | Drives `it-identity-jml-orchestrator`. Owns the lifecycle of a single JML event end-to-end. Single-instance per request envelope. | `azure-mcp` / `microsoft-mcp` (Entra ID — read+create+update users / groups), `okta-mcp` (read+update), `google-workspace-mcp` (read+update), `vault-mcp` (write — service-account secret rotation), `slack-mcp` (post — notifications) |
| `identity-mfa-operator` | Drives `it-mfa-reset` and `it-password-rotation`. Two-person-approval required for any principal with a privileged role; Cedar enforces. | Same identity-provider scopes as `jml-orchestrator`, but write-scope is *narrowed* to user-auth-methods + password-write only; user create/delete is denied. |
| `break-glass-warden` | Drives `it-break-glass-conditional-access`. Mandatory expiry timer; emits a rollback receipt at creation time. Only this class can write conditional-access policies. | `azure-mcp` (conditional-access policy create+update, scoped to a labelled set), `okta-mcp` (network-zone / policy create — same scope), `slack-mcp` (post — escalation channel) |

### team-3-endpoint

The Intune / Jamf tier. Read-only triage agents are separate from write-capable remote-action agents so Cedar can deny one principal's writes without affecting the other's reads.

| Class | Capability | Default Cedar allowlist (by recipe) |
| ----- | ---------- | ----------------------------------- |
| `endpoint-enrollment-runner` | Drives `it-endpoint-enrollment`. Creates enrollment profiles, validates heartbeat, pushes baseline apps. | `azure-mcp` (Intune — device + app + config-policy create+update), `jamf-mcp` (mobile-device + computer + configuration-profile write), `vault-mcp` (read — fetch enrollment token) |
| `endpoint-compliance-investigator` | Drives `it-endpoint-compliance-triage`. Strictly read-only. Outputs a remediation plan artifact (`endpoint-action.v1` with `phase: "plan"`). | `azure-mcp` (Intune — read), `jamf-mcp` (read), `microsoft-graph-mcp` (device / compliance — read) |
| `endpoint-remote-action-runner` | Drives `it-endpoint-remote-action`. Two-person-approval Cedar gate on `wipe`. Mandatory ticket reference on `lock`. Single device per call (Cedar denies multi-device writes). | `azure-mcp` (Intune — device-actions: lock, restart, wipe — write), `jamf-mcp` (mobile-device / computer commands — write) |

### team-4-productivity

The M365 / Google Workspace / SaaS-license tier.

| Class | Capability | Default Cedar allowlist (by recipe) |
| ----- | ---------- | ----------------------------------- |
| `m365-mailbox-operator` | Drives `it-m365-mailbox-admin`. Mailbox + delegate + hold + restore. Bulk operations Cedar-denied. | `azure-mcp` / `microsoft-mcp` (Exchange Online — mailbox + permission write), `vault-mcp` (read — fetch service principal) |
| `m365-sharepoint-teams-operator` | Drives `it-m365-sharepoint-teams`. SharePoint / Teams membership + policy. Read-by-default for *grant* operations (must surface a plan first). | `azure-mcp` / `microsoft-mcp` (SharePoint + Teams write), `slack-mcp` (post — notifications) |
| `google-workspace-operator` | Drives `it-google-workspace-admin`. Parity with the M365 operators, scoped to the Workspace MCP. | `google-workspace-mcp` (Admin SDK — read+write, scoped to Users / Groups / Drive / Calendar) |
| `license-assignment-runner` | Drives `it-license-assignment`. Bulk-aware; surfaces seat-count delta and price preview before applying. | `azure-mcp` / `microsoft-mcp` (license assignment), `google-workspace-mcp` (license assignment), `okta-mcp` (group-rule write — for license-via-group orgs) |

### Agent design notes

- Each class names a single skill it primarily drives. Classes can call sub-agents from other classes (e.g. `jml-orchestrator` calls `license-assignment-runner` mid-flow), but only via the gateway, which enforces Cedar at every hop.
- All classes inherit the foundation's mandatory `post-tool-use.sh` (custody emission) and `pre-tool-use.sh` (change-window check, see § 8 hooks).
- `agents/team-N-<bucket>/<class>.md` files mirror the team-incident-response layout (`agents/team-1-command/incident-commander.md` etc.). Frontmatter lists tools, skills, and the Cedar principal name.
- **Class-to-principal mapping.** Each agent class corresponds 1:1 to a Cedar principal of the same name. `jml-orchestrator` the class ⇔ `principal::IT::JmlOrchestrator` in Cedar. F1's generator emits the per-recipe rules tagged with these principal names; the overlay in § 6 references the same names. This 1:1 invariant is asserted in CI.
- **Single-instance vs. fan-out.** `jml-orchestrator`, `break-glass-warden`, `m365-mailbox-operator`, `m365-sharepoint-teams-operator`, `google-workspace-operator`, `license-assignment-runner`, and `endpoint-remote-action-runner` are single-instance-per-request (Cedar denies a second concurrent run for the same `request_id`). `helpdesk-router`, `helpdesk-intake-clarifier`, `identity-mfa-operator`, `endpoint-enrollment-runner`, and `endpoint-compliance-investigator` can fan out (multiple instances concurrent across different `request_id`s).
- **Sub-agent calling table.** The intended call graph is documented in `agents/team-it-helpdesk-call-graph.md`: `helpdesk-router` → (`helpdesk-intake-clarifier` | `jml-orchestrator` | `identity-mfa-operator` | `break-glass-warden` | `endpoint-*-runner` | `m365-*-operator` | `google-workspace-operator` | `license-assignment-runner`). `jml-orchestrator` further calls `license-assignment-runner` and `m365-mailbox-operator` or `google-workspace-operator`. No other inter-class call paths are permitted; Cedar denies them.
- **Default tool denies.** Beyond what F1 generates, every class has a hand-coded `forbid` line for the recipes it must never touch (e.g. `endpoint-compliance-investigator` is explicitly `forbid` against any `*.write` action across `azure-mcp` and `jamf-mcp`, even read-mode equivalents that might be misused). This is belt-and-braces — F1's allowlist alone should already be enough.

## 5. Schemas

4 JSON schemas, all draft 2020-12, all under `packages/team-it-helpdesk/schemas/`. They follow the F3 receipt envelope convention: a stable `schema_version` constant, an `$id` URL under `https://opsbench.dev/schemas/`, and `additionalProperties: false`.

| Schema | Purpose |
| ------ | ------- |
| `request.v1.json` | The inbound work envelope. Every skill accepts this as entry. Required fields: `request_id` (UUIDv4), `source` (`ticket` / `webhook` / `chat` / `manual`), `source_ref` (e.g. Linear issue URL, Slack message ts, HR event id), `bucket` (`jml` / `mfa` / `password` / `break-glass` / `endpoint-enrollment` / `endpoint-compliance` / `endpoint-remote-action` / `mailbox` / `sharepoint-teams` / `workspace` / `license` / `unknown`), `principal` (the affected user / group / device — schema below), `requester` (the person asking, with role), `ticket_ref`, `approvals` (array of `{approver, ts, decision, scope}`), `requested_at`, `priority`, `notes`. |
| `identity-action.v1.json` | Receipt emitted by `team-2-identity` agents. Required fields: `schema_version`, `request_id`, `ts`, `agent_class`, `directory` (`entra` / `okta` / `keycloak` / `google-workspace`), `principal_id`, `action` (`user.create` / `user.update` / `user.disable` / `group.add` / `group.remove` / `mfa.reset` / `password.rotate` / `conditional-access.grant` / `conditional-access.revoke`), `before_snapshot_sha256`, `after_snapshot_sha256`, `decision`, `signer_id`, `signature`. Always co-emitted with an F3 receipt; this schema captures the *domain-specific* fields that the generic receipt doesn't. |
| `endpoint-action.v1.json` | Receipt for `team-3-endpoint` operations. Required fields: `schema_version`, `request_id`, `ts`, `agent_class`, `mdm` (`intune` / `jamf`), `device_id`, `device_owner_id`, `action` (`enrollment.start` / `enrollment.complete` / `compliance.read` / `compliance.plan` / `remote.lock` / `remote.wipe` / `remote.restart` / `app.push` / `app.remove` / `profile.deploy` / `profile.remove`), `phase` (`plan` / `applied` / `failed`), `confirmation_token` (required when `action` ∈ {`remote.wipe`, `remote.lock`} — Cedar enforces), `before_snapshot_sha256`, `after_snapshot_sha256`. |
| `license-change.v1.json` | Receipt for `license-assignment-runner`. Required fields: `schema_version`, `request_id`, `ts`, `agent_class`, `provider` (`m365` / `workspace` / `adobe` / `atlassian` / `zoom` / `slack` / `github-enterprise` / `okta`), `principal_id`, `sku`, `direction` (`add` / `remove`), `seat_delta`, `monthly_cost_delta_cents`, `currency`, `phase` (`plan` / `applied`), `decision`. Cost fields are required so the receipt is auditable for finance / FinOps review. |

The `principal` sub-schema (shared by `request.v1`, `identity-action.v1`, `endpoint-action.v1`, `license-change.v1`) is defined inline in each file rather than as a `$ref` — keeps the schemas self-contained, easier to validate offline. The repo's existing schema-validation CI step picks them up automatically.

## 6. Cedar policy posture

The foundation does most of the heavy lifting. `tools-generated.cedar` (from F1) carries the per-tool allowlists derived from each MCP recipe; that gives us least-privilege per agent class for the common case. The IT-helpdesk overlay only contains rules that the generator cannot express from a tool manifest alone — the rules that depend on *intent*, *cardinality*, or *human approval state*. The overlay lives at `packages/team-it-helpdesk/policies/cedar/tools.cedar` and is small by design.

### Hand-written rules (target ≤ 30 rules total)

1. **Always-deny mass deletes / mass disables.**
   Any `entra.users.delete`, `okta.users.deactivate`, `google-workspace.users.delete` call whose request envelope's `principal` is a group (cardinality > 1) is denied unconditionally. The skill is expected to fan out one principal at a time, each with its own request envelope.
2. **Two-person approval for privileged-role MFA resets.**
   `identity-mfa-operator` calls against a principal whose directory record carries any of a configurable set of privileged-role tags (`Global Admin`, `Privileged Role Admin`, etc.) require `request.approvals[]` to contain at least 2 entries with distinct `approver` values and decision `approve`. Cedar deny if the approvals are missing.
3. **Two-person approval for remote wipe.**
   `endpoint-remote-action-runner` calls with `action: "remote.wipe"` require the same two-approver pattern. The Cedar rule reads `confirmation_token` from the receipt context and verifies it was minted by a second principal.
4. **Single-device write per call.**
   Any endpoint write action carrying more than one `device_id` in its arguments is denied. Forces fan-out and per-device custody.
5. **Break-glass time-box.**
   `break-glass-warden`'s conditional-access write is denied unless the policy carries `expiresAt` ≤ now + 2h and a `rollback_receipt_id` referencing an already-scheduled rollback action.
6. **Single active break-glass per directory.**
   At most one un-rolled-back break-glass receipt can exist per directory at a time. The gateway maintains a small ledger (in `custody.log`) the Cedar evaluator consults via a side-table; if a second `break-glass-warden` write arrives while the first is open, the second is denied.
7. **Change-window enforcement for endpoint writes.**
   `endpoint-remote-action-runner` writes (except `remote.lock` with a referenced ticket) outside the configured change-window are denied. Read-only investigation always permitted.
8. **License-change preview-then-apply.**
   `license-assignment-runner` writes are denied unless a matching `license-change.v1` receipt with `phase: "plan"` exists in the custody log within the last 30 minutes for the same `request_id`.
9. **Mailbox bulk-operation ban.**
   `m365-mailbox-operator` calls that affect more than one mailbox in a single tool invocation are denied. Bulk mailbox migrations are an explicit out-of-scope.
10. **Cross-team write isolation.**
    Agents in `team-1-front-door` and `team-2-identity` are denied write access to `team-3-endpoint`'s MDM scopes, and vice versa. Cedar principal-by-class isolation; orchestration happens via gateway-routed sub-agent calls, not via shared scope.
11. **Vault scope minimisation.**
    Only `jml-orchestrator`, `identity-mfa-operator` (read only — for service-account references), and `endpoint-enrollment-runner` (read only — for enrollment tokens) may touch `vault-mcp`. Every other class is denied.
12. **No Cedar permits without F3 signing.**
    Override of any custody-log entry without a valid Ed25519 signature is denied at the gateway. This is a belt-and-braces rule — F2/F3 already enforce signing — but it's restated here so the IT-helpdesk overlay is self-contained if read in isolation.

### What we do *not* hand-write

- Per-tool allow rules — generated by F1.
- Read-only scopes — generated by F1 from recipe metadata.
- Default-deny — set globally in `tools.cedar` (root); we inherit.

## 7. MCP recipes

We do **not** copy recipe files into this package. We cross-link and ship operational notes only. Each note lives at `packages/team-it-helpdesk/mcp-recipes/notes/<recipe-stub>.md` with a fixed header (`Recipe: <relative path>` linking back to the canonical file) and an "IT-helpdesk usage" section.

### Curated subset (with rationale)

| Canonical recipe (lives in `team-incident-response/mcp-recipes/`) | Used by classes | IT-helpdesk note |
| ----------------------------------------------------------------- | --------------- | ---------------- |
| `azure-mcp.md` | `jml-orchestrator`, `identity-mfa-operator`, `break-glass-warden`, `endpoint-enrollment-runner`, `endpoint-compliance-investigator`, `endpoint-remote-action-runner`, `m365-mailbox-operator`, `m365-sharepoint-teams-operator`, `license-assignment-runner` | The dominant recipe in this package. Notes call out Graph API rate-limits, the Entra "delta" query pattern for JML feeds, and the Intune device-action async semantics (poll for completion). |
| `microsoft-mcp.md` (added in F0) | Same as `azure-mcp` callers | Used where the vendor's parity MCP exposes APIs not yet wrapped by `azure-mcp`. Notes flag which surface to prefer for each call. |
| `vault-mcp.md` (added in F0) | `jml-orchestrator`, `identity-mfa-operator` (read), `endpoint-enrollment-runner` (read) | KV path conventions for service-account credentials: `secret/it/svc/<service>/<account>/{password,token}`. Rotation hook explained. |
| `github-mcp.md` (added in F0) | `helpdesk-router` (read), `license-assignment-runner` (GitHub Enterprise) | Notes only cover Enterprise-license assignment + read paths for issue-driven requests; the broader GitHub surface is owned by team-platform-engineering. |
| `slack-mcp.md` | `helpdesk-router`, `helpdesk-intake-clarifier`, `jml-orchestrator`, `break-glass-warden`, `m365-sharepoint-teams-operator` | Notes cover the per-class channel allowlist and the "no DM-to-end-user from agent" guard. |
| `linear-mcp.md` | `helpdesk-router`, `helpdesk-intake-clarifier` | Notes cover the standard IT-helpdesk team + label set (`it/jml`, `it/mfa`, etc.) the router uses for classification. |
| `pagerduty-mcp.md` | `helpdesk-router` (read), `break-glass-warden` (read) | Read-only; the IT-helpdesk team does not page; it consumes pages for triage context. |

### New recipes this package depends on (proposed to F0 supplementary list)

These are not yet in F0's 33-recipe list. team-it-helpdesk *needs* them to function and proposes them as the package's first contribution back to the recipe catalog. They are written in F0-light shape (the single-page template) and live in `team-incident-response/mcp-recipes/` per F0's "recipes don't get team-reorganised until F4" rule.

| Proposed recipe | Upstream | License | Notes |
| --------------- | -------- | ------- | ----- |
| `microsoft-graph-mcp.md` | `microsoft-graph-mcp/server` (verify upstream) | MIT (verify) | Direct Microsoft Graph surface; complements the higher-level `azure-mcp` / `microsoft-mcp` recipes. Important when callers need raw `/users`, `/devices`, `/groups` scopes the wrapper MCPs don't expose. |
| `okta-mcp.md` | `okta/okta-mcp-server` (verify; if missing, CLI-Anything wrap of `okta-cli`) | Apache-2.0 (vendor) or MIT (community) | Okta identity MCP; users + groups + factors + policies. |
| `jamf-mcp.md` | `jamf/jamf-mcp` (verify) or CLI-Anything wrap of the Jamf Pro API CLI | TBD | Jamf Pro for Apple-fleet management. Notes cover Smart Group semantics and the "MDM command" async lifecycle. |
| `google-workspace-mcp.md` | `googleworkspace/gws-mcp` (verify; if missing, CLI-Anything wrap of `gam`) | Apache-2.0 (vendor) or MIT (community) | Google Workspace Admin SDK. Users / groups / Drive / Calendar. Pair with the `gam` CLI for the operations Workspace doesn't yet expose via Admin SDK. |
| `keycloak-mcp.md` | `keycloak/keycloak-mcp` (verify; CLI-Anything wrap of `kcadm.sh` as fallback) | Apache-2.0 | For orgs that self-host identity. JML-orchestrator's Keycloak path. |
| `intune-mcp.md` *(optional)* | `microsoft-intune/mcp` (verify) | (verify) | Lift Intune-specific surface out of `azure-mcp` if it's noisy in practice. Decision deferred to F0 sprint; if `azure-mcp` carries Intune cleanly, this recipe is skipped. |

Cross-link `docs/integrations.md` from F0 picks these up automatically; no separate `team-it-helpdesk` integration index is needed.

## 8. Pi-first authoring notes

Every artifact in this package is authored Pi-first per the F-series cross-cutting principle. Pi (pi.dev) intentionally avoids built-in MCP; the integration model is CLI tools the user installs, Pi extensions installed via `pi install npm:@scope/pkg` or `pi install git:github.com/owner/repo`, AGENTS.md / SYSTEM.md prompt customisation, and a `models.json` for providers.

### Per-skill Pi configuration shape

Each `SKILL.md` in this package ships, in this order:

1. **`## Configuration — Pi (primary)`** — either (a) the vendor's Pi extension if it exists (rare today — none of the IT-helpdesk dependencies have shipped one as of 2026-06-04), or (b) the CLI-Anything wrap path: "Use `HKUDS/CLI-Anything` to generate a Pi-callable CLI from the upstream tool's source (e.g. the Microsoft Graph CLI, `gam`, `okta-cli`, `kcadm.sh`, the Jamf Pro Python SDK exposed as a CLI); install via `pi install git:github.com/<your-fork>/<tool>-pi-skill`." Then document the Pi `~/.pi/agent/AGENTS.md` instructions that direct the agent to call the wrapper CLI — including the exact tool name, the JSON output contract, and the Cedar principal the wrapper assumes.
2. **`## Configuration — Claude Code (secondary)`** — the standard `{mcpServers: ...}` JSONC config the user pastes into `~/.claude/mcp.json` (or the per-project equivalent). Points at the canonical MCP server from the recipe, routed via opsbench-gateway by default.
3. **`## Configuration — other hosts`** — a one-line "See `tools/<host>-compat-layer/`" pointer for Codex, Copilot, Cursor, Gemini, OpenCode. Full configs ship in F5; this package does not duplicate them.

### Per-skill AGENTS.md snippet shape (Pi)

Snippet header (paste into `~/.pi/agent/AGENTS.md` or `<project>/AGENTS.md`):

```text
# opsbench / team-it-helpdesk / <skill-name>

Tools available (via opsbench-gateway):
- <recipe-id-1> (read|write — scopes generated from tools-generated.cedar)
- <recipe-id-2> ...

Custody:
- Every tool call writes to ~/.local/state/opsbench/custody.log (F2) with Ed25519 signature (F3).
- Verify with `opsbench-gateway custody verify-signatures` or `scripts/verify-receipts.sh`.

Skill posture:
- Read-only by default; write-mode requires --apply.
- Two-person approval required for: <skill-specific list>.
- Change-window applies to: <skill-specific list>.

Tool wrapper (CLI-Anything fallback when MCP unavailable):
- pi install git:github.com/<fork>/<tool>-pi-skill
- Wrapper emits JSON on stdout; pipe to jq for shape; gateway-routed by default.
```

### Per-agent AGENTS.md / SYSTEM.md shape

Each `agents/team-N-<bucket>/<class>.md` includes a **`## SYSTEM.md (Pi)`** section users can copy into their project's `SYSTEM.md`. The section enumerates the skills the class drives, the Cedar principal name (so users know which line of `tools-generated.cedar` applies), and a short "when to use vs. not" guide.

### Distribution

Skills + agents distribute through opsbench's existing `superpowers` plugin marketplace. F5 ships the Pi-marketplace registration and the installer matrix; this package is Pi-marketplace-ready from day one because the configuration shape above is the F5 contract.

## 9. Acceptance criteria

### Package skeleton

- `packages/team-it-helpdesk/` exists with `skills/`, `agents/team-N-*/`, `schemas/`, `policies/cedar/`, `mcp-recipes/notes/`, `hooks/`, `teams/`, `README.md`, `package.json`.
- `package.json` declares the package as part of the workspace (`@opsbench/team-it-helpdesk`).
- `README.md` lists every skill, every agent class, every schema, and links to this design doc + the parent roadmap.

### Skills

- 12 skills, names exactly as listed in § 3 (`it-identity-jml-orchestrator`, `it-mfa-reset`, `it-password-rotation`, `it-break-glass-conditional-access`, `it-endpoint-enrollment`, `it-endpoint-compliance-triage`, `it-endpoint-remote-action`, `it-m365-mailbox-admin`, `it-m365-sharepoint-teams`, `it-google-workspace-admin`, `it-license-assignment`, `it-ticket-triage-router`).
- Each ships a SKILL.md with the Pi-first configuration shape (§ 8).
- Every SKILL.md frontmatter validates against the existing repo-wide skill schema.

### Agents

- 11 agent classes split across 4 sub-team buckets:
  - `team-1-front-door/` (`helpdesk-router`, `helpdesk-intake-clarifier`)
  - `team-2-identity/` (`jml-orchestrator`, `identity-mfa-operator`, `break-glass-warden`)
  - `team-3-endpoint/` (`endpoint-enrollment-runner`, `endpoint-compliance-investigator`, `endpoint-remote-action-runner`)
  - `team-4-productivity/` (`m365-mailbox-operator`, `m365-sharepoint-teams-operator`, `google-workspace-operator`, `license-assignment-runner`).
- Each agent file declares: skills it drives, Cedar principal name (matches a name `tools-generated.cedar` emits), inbound triggers, output schema(s).

### Schemas

- 4 JSON schemas under `packages/team-it-helpdesk/schemas/`: `request.v1.json`, `identity-action.v1.json`, `endpoint-action.v1.json`, `license-change.v1.json`.
- All draft 2020-12; `$id` URLs under `https://opsbench.dev/schemas/`; `additionalProperties: false`.
- `npm run validate:schemas` (existing CI step) passes.

### Cedar overlay

- `packages/team-it-helpdesk/policies/cedar/tools.cedar` exists, ≤ 30 rules, covers all 12 rules in § 6.
- `cedar validate` (the F1 CI step) passes against the combined `tools.cedar` (root) + `tools-generated.cedar` (F1) + this overlay.

### MCP-recipe cross-links

- `packages/team-it-helpdesk/mcp-recipes/notes/` contains one note per consumed recipe in § 7.
- Each note's `Recipe:` header points at a real file in `team-incident-response/mcp-recipes/`.
- Proposed new recipes (`microsoft-graph-mcp`, `okta-mcp`, `jamf-mcp`, `google-workspace-mcp`, `keycloak-mcp`) are filed as F0-supplementary issues if they don't land in F0 itself.

### Hooks

- `packages/team-it-helpdesk/hooks/pre-tool-use.sh` and `post-tool-use.sh` exist and source the foundation hooks before adding IT-helpdesk-specific checks (change-window, two-person-approval verification, principal-cardinality check).
- `subagent-stop.sh` emits a `request.v1`-keyed completion summary into custody.

### Pi-first authoring

- Every SKILL.md leads with `## Configuration — Pi (primary)`.
- Every agent class file ships a `## SYSTEM.md (Pi)` snippet block.
- `tools/pi-compat-layer/adapt.sh` (from F5) processes this package without errors. (F4 ships the *content*; F5 wires it through the adapter.)

### Cross-cutting CI

- `lint:md` + `cspell` + repo-standard schema and Cedar validation all green.
- New CI job `validate-team-it-helpdesk` runs `cedar validate` + schema validation + a fixture-based smoke test that loads each SKILL.md + AGENTS.md snippet through the Pi adapter.

### PR shape

- Single PR titled `feat(team-it-helpdesk): F4 — IT-helpdesk team package skeleton (identity, endpoint, productivity)`.
- Branch: `feat/f4-team-it-helpdesk`.
- Reviewable in chunks: one commit per sub-team bucket (front-door, identity, endpoint, productivity) plus a leading scaffolding commit and a trailing CI/policy commit. Six commits, each independently green.

## 10. Risks & mitigations

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Cedar overlay gets bigger than the F1-generated file because IT-helpdesk's rules are intent-driven, not tool-driven | Medium | The 30-rule cap is enforced by a CI assertion. If we exceed it during implementation, we trigger a spec revision rather than silently growing. F1 may need a `request_envelope_constraints:` block to absorb some of these rules; that becomes an F1 follow-up. |
| Two-person-approval pattern is hard to enforce when the approver lives in a ticketing system the gateway can't query in-line | High | Approval state is captured in `request.v1.approvals[]` *before* the skill is invoked. The router agent (`helpdesk-router`) is the only path that can stamp approvals into a request. Cedar inspects the envelope, not the ticketing system. If approvals are missing, the request gets routed back to `helpdesk-intake-clarifier`. |
| Mass-disable / mass-wipe risk if Cedar overlay fails-open due to bug | Critical | The default-deny at the root `tools.cedar` makes a failed overlay safe — write tools simply stop responding rather than going wide. CI tamper-test: a fixture request envelope that would mass-disable a group is asserted to be denied across every overlay change. |
| Recipe drift — vendor identity / MDM MCPs change tool surface and break F1-generated allowlists | Medium | Recipes carry the `tools:` frontmatter block (F1 § scope). F1's regenerator detects new tools and forces an explicit allow/deny decision before the recipe can merge. team-it-helpdesk consumes recipes by stub-link, so we get the latest allowlist automatically. |
| Pi extensions for Microsoft Graph / Okta / Jamf / Workspace don't exist; CLI-Anything wrapping is non-trivial for tools with complex auth flows (OAuth refresh, JWT-bearer, mTLS) | Medium | The Pi-first config section names the CLI-Anything fallback explicitly. Where the upstream tool already ships a credentialed CLI (`az`, `gam`, `okta-cli`, `kcadm.sh`, Jamf Python SDK), we wrap that — credentials stay where the operator already manages them. We do not implement raw OAuth in wrappers. |
| The four production-suite skills (M365 mailbox, SharePoint/Teams, Workspace, license) end up with too much overlap and bloat the package | Low | Keep them strictly separated by API surface; cross-recipe sharing of helpers lives in the skill's own `lib/`, not duplicated. License skill is the only cross-provider one; the rest are single-provider. |
| Custody log becomes too noisy because IT-helpdesk's day-to-day volume is much higher than incident-response's | Medium | The hook gains a `mode: high-volume` switch that batches read-only entries every 10s into a single signed bundle. F3's `parent_receipt_sha256` chain still works because each bundle carries the chain. Write entries are never batched. |
| Break-glass time-box bypass via clock skew | High | Cedar evaluates against `gateway.time.Now()` (signed in the receipt), not the agent's wall clock. If the host's clock skews, the receipt's `signed_at` and `expiresAt` use the same source so the bypass closes. |

## 11. Open questions

1. **Privileged-role tag set.** Rule 2 in § 6 references "a configurable set of privileged-role tags". Where does that config live — in the team package, in the F1 generator, or as a per-deployment override in `gateway.yaml`? Lean: `gateway.yaml`, with a sensible default shipped in this package.
2. **License-cost provider.** Rule 8 mandates a `monthly_cost_delta_cents` field on `license-change.v1`. Where do we source the price catalog? Options: (a) ship a static JSON of public list prices in the package and let operators override; (b) require the operator to attach a `cost-catalog.yaml` to `gateway.yaml`. Lean: (a) with an "estimate only" badge and (b) as override.
3. **Recipe placement during F0–F4 window.** F0 says recipes land under `team-incident-response/mcp-recipes/` and "F4 reorganises by team package". Does team-it-helpdesk's F4 PR trigger that reorganisation, or do we wait until all five team packages exist? Lean: wait for all five. This package only adds notes + cross-links in F4.
4. **`microsoft-mcp` vs `azure-mcp` precedence.** Two recipes for overlapping Microsoft surfaces. Do we pick a primary per skill, or document the precedence rule? Lean: document the rule once in `azure-mcp.md`'s F4 note ("Use `microsoft-mcp` when ... else `azure-mcp`"), and reference from each SKILL.md.
5. **Keycloak coverage.** Keycloak is the third identity provider after Entra and Okta. Do we make it a first-class JML target, or label it tertiary? Lean: first-class for `jml-orchestrator` only; the other identity skills (MFA reset, password rotation, break-glass) default to Entra/Okta and add Keycloak as a follow-up.
6. **Change-window source of truth.** Rule 7 enforces change-window for endpoint writes. Does the change-window live in `gateway.yaml`, in a calendar (Google / M365), or in the ticketing system? Lean: `gateway.yaml`, with a future skill (`it-change-window-calendar-sync`) syncing from a calendar. That sync is out-of-scope here.
7. **High-volume custody batching.** § 10 risk row 7 proposes batching read-only entries every 10s. Is that an F3 amendment or a team-it-helpdesk-local hook behaviour? Lean: F3 amendment, because it changes the signing contract. Capture as an F3 follow-up.
8. **Dual-stack M365 + Google Workspace orgs.** Several skills imply parity across both providers; do we ship a wrapper skill that fans out across both, or always force the caller to pick? Lean: caller picks; the JML orchestrator can call both `m365-mailbox-operator` and `google-workspace-operator` as sub-agents but doesn't abstract them.
9. **Endpoint-action `confirmation_token` minting.** Rule 3 requires a second-principal-minted token for `remote.wipe`. Who mints it — the router, the requester, or a separate `confirmation-minter` micro-class? Lean: a `confirmation-minter` capability inside `helpdesk-router` that requires an approver login distinct from the requesting agent's session. Capture as a sub-spec.
10. **F4 ordering.** Master roadmap lists this team as 5/5. Does it have any sequencing dependencies on the other four F4 teams? Lean: no. The only dependency is on F1–F3 foundation. The other F4 teams can ship before or after; team-platform-engineering touches Terraform / Crossplane which IT-helpdesk doesn't consume.
11. **Should `helpdesk-router` be merged with team-incident-response's command tier?** Both are "first-responder routing" classes. Lean: no — different blast radius, different recipe sets. Keep them separate; cross-link in docs only.
12. **License-skill provider count.** Spec lists 8 SaaS providers. Is that the right initial bar, or do we ship with just M365 + Workspace and add the others over time? Lean: ship with M365 + Workspace + Okta + Slack + Zoom (the five with mature MCPs or trivial CLI wraps); Adobe, Atlassian, GitHub Enterprise land as follow-ups inside the same skill, no new package needed.
