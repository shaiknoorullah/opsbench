---
id: HANDOFF-OPSBENCH-SPINE-001
title: "Opsbench Platform Spine — Session Handoff (continue C7 slice 2 + C4)"
status: active
created: 2026-07-03
author: "Claude Code session (Shaik Noorullah, driver)"
---

# Handoff: continue the governed-action spine (C7 slice 2 + C4)

This is a complete, self-contained handoff. Read this + the two linked docs
(`2026-07-01-platform-gap-analysis-and-build-plan.md`, the spec under
`docs/superpowers/specs/opsbench-platform/`) and you have everything to continue.

## 0. Your immediate job

Continue **option 2** of the platform build:

1. **C7 slice 2** — adapt the C7 identity registry as C1's `policygateway.Store` so C1
   pulls real agent→teams from C7; unknown/revoked agents default-deny end-to-end.
   (task #16)
2. **C4 credential-broker** — `MintWrite(agent, taskID, scope) → short-lived Credential`
   (intersection scope via C7, attribution tags, NF-007 lifetime), replacing C2's
   `fakeBroker`. (task #17)

## 1. What opsbench is (1 paragraph)

opsbench is being built into a **full enterprise "governed-action" control plane** — the
authoritative direction is `SPEC-OPSBENCH-001` (draft) consuming the **approved**
`PRD-OPSBENCH-001 v1.0.0`. 16 components (C1–C16); the MVP is the "demo the market can't
ignore" (agent investigates → blocked by policy → phones on-call → ack → executes via the
gatekeeper with dry-run → signed, offline-verifiable evidence), built **spine-first**. The
spine is `C1 Policy Gateway → C2 Gatekeeper → C4 Credential Broker → estate`, plus `C3
Approvals`, `C5 Audit Ledger`, `C7 Identity Registry`. Full plan-vs-reality + build plan:
`docs/superpowers/plans/2026-07-01-platform-gap-analysis-and-build-plan.md`.

## 2. Current build state (verified 2026-07-03)

| Component | State | Where |
|---|---|---|
| C5 Audit Ledger | **shipped** (on main) | `platform/services/audit-ledger/` |
| C2 Gatekeeper | **library** (on main; in-mem, no HTTP) | `platform/services/gatekeeper/` |
| C3 Approvals | **library** (on main; in-mem) | `platform/services/approvals/` |
| **C1 Policy Gateway** | **DONE, tested, runnable** — NOT yet merged | branch `feat/c1-policy-gateway`, **PR #33 (ready for review)** |
| **C7 Identity Registry** | **slice 1 done** (registry core) — NOT merged | branch `feat/c7-identity-registry`, **PR #34 (draft)** |
| C4 Credential Broker | **not started** | — |
| everything else (C6/C8–C16) | design-only | spec |

Other open PR: **#32** = the gap-analysis doc (`docs/superpowers/plans/2026-07-01-...`).

`main` = `88a51dd` (post-consolidation: PR #27 cedar-hook fix + all dependabot merged; all
stale branches deleted). Both C1 (#33) and C7 (#34) branch off `88a51dd`.

## 3. ⚠️ CRITICAL first step — branch/merge ordering

**C7 slice 2 imports C1's `policygateway` package, which is only on the unmerged
`feat/c1-policy-gateway` branch (not on main).** So before doing C7 slice 2 you must have
both C1 and C7 available together.

**Recommended:** merge **PR #33 (C1)** then **PR #34 (C7 slice 1)** into `main` (both are
solid + fully tested), then create a fresh branch off the updated `main` (which now has
`policygateway` + `identityregistry`) for C7 slice 2 + C4. C4 (credential-broker) only
needs the gatekeeper package (already on main), but doing everything off a main that has
C1+C7 is simplest.

Merge commands (mind §6 identity guard):

```
gh auth switch --user shaiknoorullah && gh api user -q .login   # must print shaiknoorullah
gh pr merge 33 --squash --delete-branch
gh pr merge 34 --squash --delete-branch
git fetch origin main && git checkout main && git merge --ff-only origin/main
git checkout -b feat/c7-store-and-c4-broker    # or two separate branches
```

If you'd rather not merge yet: do the work on a branch created from `feat/c1-policy-gateway`
(which has C1) and cherry-pick / merge C7's registry.go into it. Merging is cleaner.

## 4. Exact APIs you'll build against

### C1 `policygateway` (package `policygateway`, dir `platform/services/policy-gateway`)

```go
// store.go — the seam C7 must satisfy
type ToolMeta struct { Parents []string; Attrs map[string]any }
type Store interface {
    AgentTeams(agentID string) []string          // nil => agent has no teams => default-deny
    Tool(toolID string) (ToolMeta, bool)
}
type MemoryStore struct { ... }                   // reference impl (SetAgentTeams/SetTool)

// service: build with WithStore so Evaluate enriches thin ids
func NewService(engine *CedarEngine, recorder Recorder, tenantID string, opts ...Option) *Service
func WithStore(s Store) Option
func (s *Service) Evaluate(ctx, RequestRef, Phase) (Decision, error)  // enriches via store, records PDR (DP-3)
type RequestRef struct { Principal, Tool, Resource string; Context map[string]any }
type Decision struct { Effect string; Tier int; PolicyRefs []string; DecisionRecordID string }
```

C1 default-denies when `AgentTeams` returns nil (proven by the existing
`TestC1Integration_UnknownAgentDefaultDenies`). So a Store backed by C7 that returns nil
for unknown/revoked agents gives end-to-end deny for free.

### C7 `identityregistry` (package `identityregistry`, dir `platform/services/identity-registry`)

```go
type AutonomyLevel int   // L0..L4, .String()
type Agent struct { ID, TenantID string; Teams []string; Owner string; Autonomy AutonomyLevel; OnBehalfOf []string; /* revoked (unexported) */ }
func New() *Registry
func (r *Registry) Register(Agent)      // re-register clears revocation
func (r *Registry) Revoke(id string) bool
func (r *Registry) Lookup(id string) (Agent, bool)   // false if unknown OR revoked
func (r *Registry) Teams(id string) []string         // nil if unknown/revoked  <-- feeds C1 Store
func (r *Registry) IsActive(id string) bool
```

### C2 `gatekeeper` (package `gatekeeper`, dir `platform/services/gatekeeper`)

```go
// types.go — the seam C4 must satisfy
type Credential struct { Token string; ExpiresAt time.Time }
type CredentialBroker interface {
    MintWrite(ctx context.Context, agent, taskID, scope string) (Credential, error)
}
// Config wires collaborators: Policy, Approvals, Broker, Freeze, Ledger, Now.
// Execute step 8 calls Broker.MintWrite(ctx, a.Agent, a.TaskID, a.Resource); on error -> OutcomeDenied + err (fail closed).
```

Adapter pattern (IMPORTANT, follow it): the gatekeeper defines narrow interfaces; the tiny
adapter lives **in the gatekeeper package** importing the neighbor. See
`gatekeeper/ledger_adapter.go`, `gatekeeper/policy_adapter.go`,
`gatekeeper/policy_http_adapter.go`. So build C4 in its own package with its own types,
then add `gatekeeper/credential_adapter.go` wrapping it as `CredentialBroker`.

C5 helpers you can reuse: `auditledger.Canonicalize(v any) ([]byte, error)`,
`auditledger.SHA256(...)`, `auditledger.LedgerID()`.

## 5. Concrete design for the two tasks

### Task #16 — C7 → C1 Store adapter

- New file `platform/services/identity-registry/policystore.go` (package `identityregistry`,
  imports `policygateway`). Direction C7→C1 is fine (C1 does NOT import C7 → no cycle).
- `type PolicyStore struct { reg *Registry; tools policygateway.Store }` implementing
  `policygateway.Store`: `AgentTeams(id) => reg.Teams(id)` (nil for unknown/revoked);
  `Tool(id) => tools.Tool(id)`. Inject a tool source (C10 isn't built — use a
  `policygateway.MemoryStore` for tools, or a minimal `ToolRegistry`).
- Integration test: build C7 registry (register an active agent in team "sre"), a C1
  `CedarEngine` (use `policygateway.DefaultPlatformPolicy`), `NewService(..., WithStore(PolicyStore))`,
  wrap with `gatekeeper.NewPolicyAdapter(svc)`, wire a `gatekeeper.Gatekeeper`, and assert:
  active agent → permit/execute; **revoked agent → default-deny** (revoke then re-Execute).
  This proves the C7→C1→C2 chain: identity governs authorization.

### Task #17 — C4 credential-broker

- New package `platform/services/credential-broker` (package `credentialbroker`).
- `Broker.Mint(ctx, agent, taskID, scope) (Cred, error)` where `Cred{Token string; ExpiresAt time.Time; ...attribution}`.
  - Verify the agent is **active in C7** (inject the `*identityregistry.Registry` or a
    minimal `IdentitySource` interface `IsActive(id) bool` / `Lookup`); inactive/revoked →
    error (fail-closed → C2 denies).
  - Mint a **short-lived** token (`crypto/rand` hex + `ExpiresAt = now + TTL`); **NF-007**:
    TTL is always set and capped (default e.g. ≤ 15m, configurable); **never** a non-expiring cred.
  - **Attribution tags**: record `{agent, taskID, onBehalfOf, scope, issuedAt, expiresAt}`
    in an **inventory** (in-mem list); expose `Inventory()` + assert zero non-expiring.
  - **Intersection scope**: effective scope = agent's permitted scope (from C7) ∩ requested
    scope. C7's `Agent` has no explicit scope grant yet, so for slice 1 either (a) treat an
    active agent as permitted for the requested scope and note intersection-scope as a
    follow-up needing a C7 scope model, or (b) add a `Scopes []string` field to C7's `Agent`
    and intersect. Prefer (b) if quick; document either way.
  - Injectable clock (`now func() time.Time`) + token gen for deterministic tests.
- `gatekeeper/credential_adapter.go`: `NewCredentialAdapter(*credentialbroker.Broker) CredentialBroker`
  mapping `Mint → gatekeeper.Credential{Token, ExpiresAt}`; on broker error return it (C2 fails closed).
- Integration test in `gatekeeper` (mirror `TestFailClosedOnCredentialMintError` +
  `TestHappyPathExecutesAndLedgers`): to reach step 8 (MintWrite) use `fakePolicy{dec: permit(1)}`
  (tier 1 → **no approval** needed) so Execute proceeds to mint. Assert: active agent →
  `OutcomeExecuted`, cred minted with future `ExpiresAt` + inventory has 1 non-expiring-free
  entry; revoked/inactive agent → `OutcomeDenied` + non-nil err + tool not applied.

## 6. ⚠️ Git identity + push (READ — this bit us repeatedly)

- Use the **`shaiknoorullah`** gh account. **Never `snoorullah`** and **never the
  `github_work` SSH keys** (user's explicit constraint). See memory `git-identity`.
- The active gh account **keeps reverting to `snoorullah`** between commands. ALWAYS:

  ```
  gh auth switch --user shaiknoorullah >/dev/null 2>&1
  WHO=$(gh api user -q .login); [ "$WHO" != "shaiknoorullah" ] && { echo ABORT; exit 1; }
  ```

  before ANY push / PR / merge. (An earlier merge attempt ran as `snoorullah` and failed on
  permissions — the guard now catches it.)
- Push over **https with the gh token** (not SSH):

  ```
  git -c 'credential.https://github.com.helper=!gh auth git-credential' \
    push https://github.com/shaiknoorullah/opsbench.git <branch>:refs/heads/<branch>
  ```

  Never `git push origin` (origin is SSH → work keys). Merges/deletes/PRs via `gh` (API, uses the token).

## 7. Build / test / conventions

- Go module `github.com/shaiknoorullah/opsbench/platform`, go 1.23. Service dir names are
  hyphenated; **package names are hyphenless** (`policy-gateway`→`policygateway`,
  `identity-registry`→`identityregistry`, so `credential-broker`→`credentialbroker`).
- Build/test from `platform/`: `go vet ./... && go build ./... && go test ./...`.
- **Sandbox/network**: the Bash sandbox **blocks egress**. Any command needing the network
  (`go get`, `go build` first fetch, `npm`, `gh` push) must run with
  `dangerouslyDisableSandbox: true`. crates.io is blocked; the **Go module proxy and npm
  work** when unsandboxed. `cedar-go@v1.8.0` is already in the module cache (only C1 uses it).
- **Commits**: Conventional Commits; `commitlint` enforces the scope enum — use scope
  **`platform`**. End every commit body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  End PR bodies with: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- `lefthook` runs on commit (commitlint) + pre-push (validate-skills/agents/install-syntax)
  and `cedar-validate` when a `.cedar`/`.cedarschema` is staged (that hook runs the **toolkit's**
  wasm gate `npm run test:policies` — it validates the toolkit policies, not platform ones;
  it passes, ignore it). Go files trigger no lint hooks. Everything is green currently.
- Per-component workflow used so far: small slices, each `go vet` + package test + full
  `go test ./...` green, commit (scope platform), push to the component's PR.

## 8. Key file map

- C1: `platform/services/policy-gateway/` — `engine.go` (CedarEngine, Decide, deriveTier),
  `record.go` (Service, Authorize, PolicyDecisionRecord, Recorder, MemoryRecorder),
  `eval.go` (Evaluate, RequestRef), `filter.go` (ToolFilter, ToolRef), `store.go` (Store,
  MemoryStore, ToolMeta), `freeze.go` (FreezeService), `server.go` (HTTP), `ids.go`,
  `log_recorder.go`, `policies.go` (embeds `policies/platform.cedar`), `policies/platform.cedar`,
  `cmd/policy-gateway/main.go`. Adapter into C2: `gatekeeper/policy_adapter.go` (in-process)
  and `gatekeeper/policy_http_adapter.go` (HTTP).
- C7: `platform/services/identity-registry/registry.go`.
- C2: `platform/services/gatekeeper/{gatekeeper.go (10-step Execute), types.go (interfaces),
  ledger_adapter.go, approval_adapter.go, policy_adapter.go, policy_http_adapter.go,
  *_test.go (fakes: fakePolicy/fakeApprovals/fakeBroker/fakeFreeze/fakeLedger/fakeTool,
  action(), permit(), newGK())}`.
- C5: `platform/services/audit-ledger/` (Canonicalize, SHA256, LedgerAppender, MemoryLedgerStore, VerifyChain).
- Schemas: `platform/packages/schemas/json/*.json` (policy-decision-record, autonomy-certificate,
  capability-envelope, common {spiffeId, principal, ULID, sha256}).
- Plans/spec: `docs/superpowers/plans/2026-07-01-platform-gap-analysis-and-build-plan.md`,
  `docs/superpowers/specs/opsbench-platform/*`, `docs/superpowers/prd/opsbench-platform/*`.

## 9. Definition of done for this handoff's work

- C7 slice 2: a `policygateway.Store` backed by C7; integration test proving active-agent
  permit + revoked-agent deny through C1→C2; committed + pushed to a PR (identity-guarded).
- C4: the broker package + gatekeeper adapter + integration test replacing `fakeBroker`
  (execute-with-real-cred + fail-closed-on-inactive); NF-007 (TTL always set) asserted;
  committed + pushed to a PR.
- Every step: `go vet` + `go test ./...` green. Update the gap-analysis doc's component
  matrix (C7 → working, C4 → working) when done.

## 10. Loose ends / notes

- PR #32 (gap analysis) and #33 (C1) and #34 (C7) are open; decide with the user whether to
  merge #33/#34 (recommended, see §3) before continuing.
- C10 connector-hub (tool metadata) isn't built — C1's `Tool()` source is stubbed via a
  MemoryStore; fine for now.
- Team package.json still says `version 3.0.0` (vestigial); unrelated drift, don't worry.
