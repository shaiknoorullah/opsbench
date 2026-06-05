# F6 — agentgateway architectural evaluation

**Status:** draft 2026-06-04 — awaiting reviewer approval
**Author:** Claude Code session (Shaik Noorullah, driver)
**Parent roadmap:** [`./2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md) — F6 section
**Sibling spec:** [`./2026-06-04-f2-design.md`](./2026-06-04-f2-design.md) — opsbench-gateway (the artifact this doc evaluates against)
**Inputs:**

- [`../research/2026-06-04-ecosystem-catalog.md`](../research/2026-06-04-ecosystem-catalog.md) — catalog entry for `agentgateway/agentgateway`: Rust/Envoy AI-native dataplane, ~3,000 stars, last active 2026-05-23, Apache-2.0, pre-GA, LF/CNCF orbit, native MCP + A2A protocol speaker.

## 1. What is agentgateway?

`agentgateway/agentgateway` is a Rust-implemented "AI-native" L7 dataplane built on the Envoy proxy core. Unlike a general-purpose API gateway, agentgateway speaks the agent-tier protocols natively: MCP (Model Context Protocol) and A2A (Agent-to-Agent). It sits in the data path between agent runtimes and the upstream tools / sub-agents they call, treating each MCP `tool/call` or A2A `message/send` as a first-class routing primitive rather than an opaque JSON body riding over HTTP. As of 2026-06-04 the project carries ~3,000 GitHub stars, was last active 2026-05-23, is Apache-2.0 licensed, and runs in the LF/CNCF orbit — pre-GA but on a credible trajectory toward graduation.

Architecturally agentgateway inherits Envoy's filter-chain extension model. New behaviour (auth, policy, transformation, telemetry) is added as filters that operate over MCP/A2A envelopes. The project's positioning materials explicitly invite ecosystem extensions — third-party filters can be compiled in or, on the WASM-filter path, loaded dynamically. This matters for opsbench: it is the seam through which a Cedar evaluator + custody-log emitter could plug in without forking the dataplane core.

## 2. How does it overlap with opsbench?

The overlap with opsbench-gateway (F2, Go fork of `stacklok/toolhive`) is substantial enough that this evaluation is necessary. Three concrete intersection points:

### 2.1 MCP routing

Both projects accept inbound MCP traffic from agents (stdio or streamable HTTP), parse the MCP envelope, and demultiplex to N upstream MCP servers. F2 inherits this from toolhive's router; agentgateway implements it in Rust on Envoy primitives. The route-selection key is the same in both designs — `<upstream-id>::<tool-name>` — though the wire encoding differs (F2 uses a per-upstream URL sub-path `:8765/mcp/<id>`, agentgateway uses Envoy-style virtual-hosts plus MCP-aware listener filters).

Functional parity is high. agentgateway has the performance advantage (Envoy/Rust, multi-threaded request loop, well-trodden listener stack). opsbench-gateway has the ergonomic advantage for the current opsbench audience (Go binary, single static artifact, no Envoy operator knowledge required).

### 2.2 Policy enforcement

F2 ships a Cedar evaluator (cedar-go in-process, hand-written `tools.cedar` + F1-generated `tools-generated.cedar`, merged with hand-written winning). agentgateway ships its own filter-level policy primitives (rate limit, mTLS, JWT, header-driven allow/deny) plus an extension path for arbitrary filters. agentgateway does *not* ship a Cedar evaluator out of the box — its filter catalog at the 2026-05-23 snapshot leans on OPA/Rego and ad-hoc policy filters.

This is the most important overlap: agentgateway has a *policy slot*, opsbench has a *Cedar policy posture*. The interesting question for F6 is whether opsbench's Cedar posture should be a filter inside agentgateway's slot, or stay inside a sibling Go gateway that opsbench controls end-to-end.

### 2.3 A2A protocol vs MCP-only focus

agentgateway speaks A2A natively. opsbench-gateway, per the F2 spec, is MCP-only — toolhive's router is MCP-only and F2 does not add A2A support. This is a forward-looking gap: opsbench's roadmap (F4 team packages, F5 multi-host parity) does not yet require A2A, but multi-agent coordination (the sympozium evaluation in F6's queue, and any future "orchestrator passes work to specialist" pattern that crosses gateway boundaries) eventually does. If opsbench's posture has to extend to A2A, building it on top of agentgateway costs one filter; building it in opsbench-gateway costs an entire new protocol parser.

Secondary overlaps exist (telemetry shape, redaction filters, rate limiting). They are not the decision drivers — the three above are.

## 3. Three relationship options

The three options the parent roadmap names — `competes`, `composes`, `replaces` — line up with three concrete architectural postures:

### 3.1 Option A — Compete

opsbench-gateway ships as a Go-based, Cedar-focused alternative to agentgateway. The two projects address overlapping audiences with intentionally different trade-offs: opsbench is "Pi-first, single-host, Go-binary, Cedar-native, evidence-first"; agentgateway is "Envoy/Rust, multi-host, A2A-capable, filter-extensible". Users pick one based on their constraints.

**Pros:**

- opsbench retains full control over the policy + custody-log envelope. Schema bumps (F2 v1 → F3 v2 with Ed25519 signatures) ship without coordinating with a CNCF-orbit project.
- The Go fork base (`stacklok/toolhive`) is already vendored and proven in F2's plan. No Rust/Envoy onboarding cost.
- Single static binary aligns with the F2 distribution story (Homebrew/AUR/Nix, F5 installer matrix).
- The differentiation is real and defensible: Cedar-native evidence-first MCP gateway is a tighter market position than "another agent dataplane".

**Cons:**

- opsbench takes on long-term maintenance for the routing/transport core. Every transport addition (WebSocket, gRPC, A2A when needed) is opsbench's problem, not Envoy's.
- Performance ceiling is bounded by toolhive's Go router. Envoy's Rust filter chain is meaningfully faster at high QPS — irrelevant at current opsbench usage, potentially limiting if opsbench grows into multi-agent fleets.
- Two communities solving overlapping problems is wasteful if a credible compose path exists.
- "Pre-GA" is not "pre-anything-real" — agentgateway already has ~3,000 stars, more than 1.5× toolhive's ~1.8k. The momentum gap favours them.

### 3.2 Option B — Compose

opsbench's Cedar policy engine + custody-log emitter ships as an agentgateway plugin (filter). The Go gateway either retires or remains as a transitional artifact while the filter is the long-term home. agentgateway owns transport / routing / A2A; opsbench owns policy + evidence.

**Pros:**

- Clean separation of concerns: agentgateway handles "agent dataplane plumbing", opsbench handles "Cedar policy + signed-receipt evidence". Both projects play to their strengths.
- opsbench inherits A2A support for free the moment we need it (the sympozium-class workload in F6's later queue).
- The Cedar filter is a concrete contribution that establishes opsbench's presence in the CNCF/LF agent ecosystem — strategic positioning beyond just opsbench's own users.
- Envoy's filter ABI gives a clean integration boundary. Schema bumps for custody-log v2 are internal to the filter; the dataplane doesn't care.
- F3's Ed25519 receipts can ride entirely inside the filter — agentgateway's telemetry path emits the filter's events to whatever sink the operator wires up.

**Cons:**

- Rust implementation cost. opsbench has no Rust in tree today; the filter has to be written, tested, and maintained in a second language. The team's Go/TypeScript depth doesn't transfer.
- Cedar's mature evaluator implementations are Rust (`cedar-policy/cedar`) and Go (`cedar-go`). The Rust path is actually *easier* than F2's Go path here — but only if we accept the Rust footprint.
- agentgateway's pre-GA status means the filter ABI may break before stabilising. We carry a moving target.
- The dual-codebase period (Go gateway + Rust filter) is a real cost — until agentgateway hits GA and the Cedar filter is upstream-blessed, opsbench is maintaining both.
- Cedar evaluator FFI vs subprocess decisions need to be made (§ 7.2). Each has trade-offs that don't exist in pure-Go F2.

### 3.3 Option C — Be replaced by

opsbench-gateway is wound down. opsbench's published architecture recommends agentgateway as the gateway, plus a thin Cedar plugin (potentially upstreamed to agentgateway's filter catalog) for opsbench's policy posture. opsbench shifts focus to the policy-authoring tooling, recipes, custody-log analysis, and team packages — *not* the gateway itself.

**Pros:**

- Maximum focus. opsbench stops competing with a well-funded CNCF-orbit project and concentrates on the things only it does (Cedar-for-agents adoption pipeline, evidence-first recipe catalog, Pi-first multi-host parity, team packages).
- No long-term Go routing-core maintenance.
- Users get a battle-tested Envoy/Rust dataplane plus opsbench's Cedar posture, which is arguably the best of both worlds.
- Simplifies the F4 team-package story — every recipe just says "configure agentgateway with the opsbench Cedar filter" instead of "configure opsbench-gateway".

**Cons:**

- Throws away F2's investment. F2's plan is ~3–5 PRs of work; replacement makes that work transitional at best, redundant at worst. The reviewer is unlikely to greenlight this before F2 ships and pays for itself.
- Bets opsbench's evidence guarantee on agentgateway's GA timeline and its willingness to keep a stable Cedar-filter ABI. We lose control over the audit choke-point.
- Pi-first goal becomes harder: Envoy + Rust is a heavier install than a single Go binary on a Pi-equivalent host.
- opsbench loses a tangible artifact people install. The brand becomes "policies and recipes that configure agentgateway" — a thinner positioning.
- Migration cost for existing users is non-trivial (recipe rewrites, key bootstrap repointing, custody-log schema reconciliation).

## 4. Recommended relationship

**Recommendation: B (compose) if agentgateway hits GA before opsbench-gateway has more than 3 production users, otherwise A (compete).**

The trigger is deliberate and operational, not aspirational. The two halves of it are concrete:

- **"agentgateway hits GA"** — defined as an upstream release tagged `v1.0.0` (or whatever the project picks as their GA marker) on a stable filter ABI, with at least one Cedar/OPA-class policy filter upstreamed or accepted into the filter catalog so opsbench's contribution is not a green-field experiment. The 2026-05-23 activity signal suggests a 12–18 month horizon, but timing is the open question (§ 7.1).
- **"opsbench-gateway has more than 3 production users"** — defined as 3+ distinct, externally identifiable installations of `opsbench-gateway` running F2-or-later in non-toy environments (any of: an organisation's SOC, a managed-service provider's runbook stack, an enterprise platform team's agent surface). 3 is the threshold because below it the maintenance cost of a Go gateway is unjustified versus contributing to a single shared dataplane; at or above it the user-facing transition cost of a replacement starts to outweigh the strategic benefit of consolidation.

Why the asymmetric trigger:

- If agentgateway gets to GA *before* opsbench-gateway picks up real users, opsbench-gateway is still a bet rather than a load-bearing artifact. Folding into agentgateway as a filter is cheap (low migration surface), captures the strategic positioning win, and frees opsbench engineering to focus on the parts only opsbench does.
- If opsbench-gateway has cleared 3+ production users *before* agentgateway hits GA, those users are an installed base whose audit chains and custody logs reference the Go gateway's signature scheme. Migration is no longer free; the right call is to keep competing, contribute the Cedar pattern to agentgateway anyway as a public good (one-off, not coupled to opsbench's primary roadmap), and let the two implementations co-exist.
- The threshold is intentionally low (3, not 30). Above 3 the social cost of pulling the rug starts to dominate; below 3 the engineering cost of dual maintenance dominates. This matches opsbench's revealed preference for "ship one focused artifact" over "maintain two parallel implementations of the same primitive".

This recommendation is also revisitable: F6 is explicitly a brainstorming-pass-plus-design-doc phase, not an implementation commitment. The next F6 pass re-evaluates once we have either signal (agentgateway GA tag dropped; opsbench-gateway adoption hits the threshold). Until then F2 ships and pays for itself.

A side note on Option C: replacement is not the recommendation under any of the conditions visible today because F2's investment is small, opsbench's audit-chain story works *better* when opsbench owns the gateway's signing surface end-to-end (F3), and the Pi-first install story is materially easier with a single Go binary than with Envoy + a filter bundle. C re-enters the conversation only if both triggers above flip (agentgateway GA *and* opsbench-gateway adoption stalls), which is a worst-case-for-opsbench scenario rather than a planned path.

## 5. If "compose" — concrete integration points

The compose path crystallises into a Rust filter shipped from this repo and consumed by agentgateway. The shape below is specified concretely enough that the F6 follow-up can execute against it.

### 5.1 Rust plugin shape

The filter lives at `packages/opsbench-agentgateway-filter/` (sibling to `packages/opsbench-gateway/`, not under it — different language, different release cadence, different consumers). Layout:

```text
packages/opsbench-agentgateway-filter/
├── Cargo.toml                          # crate name: opsbench-agentgateway-filter
├── README.md                           # install + agentgateway filter-chain config
├── LICENSE                             # Apache-2.0 to match agentgateway upstream
├── src/
│   ├── lib.rs                          # filter entry point, agentgateway ABI surface
│   ├── cedar.rs                        # cedar-policy crate wrapper (in-process)
│   ├── custody.rs                      # JSONL writer, redaction, schema bumps
│   ├── receipts.rs                     # Ed25519 signing (F3-aware from day one)
│   ├── config.rs                       # filter config schema (mirrors gateway.yaml subset)
│   └── pi_snippet.rs                   # optional helper to emit Pi AGENTS.md snippets
├── tests/
│   ├── differential_with_cedar_go.rs   # asserts identical decisions with F2's cedar-go path
│   └── fixtures/
│       ├── tools.cedar
│       ├── tools-generated.cedar
│       └── opsbench-schema.cedarschema.json
└── dist/
    └── agentgateway-filter.yaml        # example filter-chain snippet
```

The filter's `lib.rs` exports the symbols agentgateway expects of a policy filter (the exact surface depends on whether agentgateway picks WASM filters or native filter ABI as the stable extension path — see § 7.2). The filter receives the decoded MCP envelope plus a context object, evaluates Cedar, emits a custody-log line, optionally signs the line (F3), and returns allow/deny.

### 5.2 Cedar evaluator: FFI vs subprocess

Two paths exist for hosting the Cedar evaluator inside the filter:

1. **In-process via `cedar-policy` crate (FFI-free).** The official Rust crate is the reference implementation. Loading it directly into the filter is the fastest path (~10–50µs/eval), eliminates an out-of-process dependency, and matches the language the filter is written in. The trade-off is that the filter and the F2 Go gateway then evaluate via different code paths, so the differential test fixture from F2's § 6 ("cedar-go vs cedar Rust CLI") graduates into a cross-implementation contract test: the filter's Rust evaluator and F2's cedar-go evaluator must produce identical decisions on the same fixture set. CI runs this on every PR to either package.
2. **Out-of-process via a Cedar CLI subprocess.** The filter shells out to a `cedar` binary per request. Latency is dominated by process startup (~1–5ms), which is unacceptable at any non-trivial QPS. The only argument for this path is "matches the canonical Rust CLI exactly", and the contract test in path 1 already gives us that without the cost. **Rejected.**

**Recommendation: in-process via the `cedar-policy` Rust crate.** Pin a specific Cedar version that matches whatever F1's generator targets. The differential fixture lives in `packages/opsbench-agentgateway-filter/tests/fixtures/` and is the same JSON file F2 already uses, ensuring drift between the two implementations is caught by a shared artifact.

### 5.3 Custody-log emitter

The filter writes JSON-Lines to a path declared in filter config (default: `~/.local/share/opsbench/custody.log`). The schema is the same `custody-log.v1.json` F2 ships, so a custody log produced by either gateway is verifiable by either verifier — `opsbench-gateway custody verify-format <path>` works against filter-produced logs and vice versa. This is non-negotiable; if the filter forks the schema, the F3 evidence guarantee fragments.

Implementation notes:

- Writer is a single async task fed by an `mpsc` channel from the filter's request handler. Backpressure is exposed via filter metrics.
- Redaction logic is a direct port of `packages/opsbench-gateway/internal/custody/redact.go`. The shared redaction pattern list lives in `packages/_shared/redaction-patterns.yaml` (new) and is consumed by both implementations to avoid drift.
- Rotation, fsync semantics, and atomic file swap mirror F2 to keep operator runbooks identical across the two gateways.

### 5.4 Signed-receipt (F3) preservation in the filter layer

F3 introduces Ed25519-signed receipts on top of the custody-log schema. The compose path must preserve this end-to-end:

- The filter loads its signing key from the same `~/.config/opsbench/keys/gateway.key` path F3 specifies. Key bootstrap is handled by opsbench's installer regardless of which gateway runs.
- The signing payload covers the same canonicalised JSON fields F3 names (`ts`, `gateway_id`, `agent_class`, `upstream_id`, `tool`, `args_sha256`, `response_sha256`, `decision`, `policy_files`). The signature is appended to the custody-log entry as the `signature` field. A filter-produced line is byte-for-byte verifiable by F3's `scripts/verify-receipts.sh` without modification.
- `gateway_id` is generated by the filter on first start and persisted at `~/.local/state/opsbench/gateway-id`, identical to F2's behaviour. A user who switches from opsbench-gateway to the agentgateway filter sees the gateway_id change, which is correct — a different signing surface is a different gateway from an audit standpoint.
- Receipt rotation, multi-key acceptance, and the public-key fingerprint publishing flow are unchanged from F3. The filter is just another producer of the same audit envelope.

The net result: a custody log produced by the filter is indistinguishable from a custody log produced by the Go gateway, and downstream verification tooling does not branch on producer.

## 6. If "be replaced by" — migration path

If the trigger conditions flip in the unfavourable direction (agentgateway GA + opsbench-gateway adoption stalls), the replacement path is the right call. The migration is bounded but non-trivial.

### 6.1 Deprecation timeline

- **Month 0 (decision point):** F6 follow-up doc declares replacement. opsbench-gateway moves into maintenance mode — security fixes only, no new features. The filter (§ 5) becomes the recommended production path.
- **Month 0–3:** Recipes get a third config block: "Configuration — agentgateway + opsbench filter (recommended)". The opsbench-gateway block moves to "supported (transitional)" status. Direct-connection block stays as the "advanced (bypasses opsbench evidence)" fallback. Each recipe ships in this three-block form.
- **Month 3–6:** Installer changes default. `brew install shaiknoorullah/opsbench/opsbench` installs the agentgateway filter assets instead of the opsbench-gateway binary. Users on the Go gateway get a deprecation notice on every startup.
- **Month 6–12:** opsbench-gateway binary moves to a separate repo under maintenance ownership. Main repo no longer ships it. Recipes drop the transitional block.
- **Month 12+:** Maintenance-only repo enters end-of-life with one final security-patch window and a sunset notice.

This is intentionally long. Users carry custody logs and Ed25519 receipt chains that reference the Go gateway as the signer; the timeline gives them room to verify and (if they choose) archive those chains before the producer goes away.

### 6.2 Recipe rewrites

Every F0 recipe needs a third configuration block (the recommended agentgateway form). The mechanical shape:

```yaml
# agentgateway + opsbench filter (recommended; production)
mcpServers:
  vault:
    transport: streamable-http
    url: "http://localhost:8765/mcp/vault-mcp"  # agentgateway listener
    headers:
      X-Opsbench-Context-Incident-Round: "0"
```

The URL form stays the same (`:8765/mcp/<upstream-id>`) precisely so existing recipe text needs only the block name + a one-line "powered by agentgateway" note. The custody-log path, redaction config, and Cedar policy paths all transfer one-for-one. The recipe rewrite is therefore a docs-shape change, not a config-shape change for the agent.

A `scripts/migrate-recipes-to-agentgateway.sh` codemod ships in the deprecation PR: it takes a recipe and emits the rewritten three-block form. CI runs the codemod against every F0 recipe and asserts no manual edits are needed beyond the rewritten frontmatter.

### 6.3 Cedar policy export to agentgateway's native format

agentgateway's filter catalog may stabilise on a non-Cedar policy primitive (OPA/Rego is the most likely incumbent given current ecosystem inertia). If so, opsbench's Cedar policies need an export path:

- The Cedar-for-agents toolchain (F1) already produces Cedar from MCP recipes. We add a second emitter: `scripts/cedar-to-agentgateway.sh` that takes `tools.cedar` + `tools-generated.cedar` + the schema and emits whatever filter-chain config agentgateway has standardised on (Rego, native YAML rules, or — in the favourable case — Cedar directly via the opsbench Cedar filter from § 5).
- If the opsbench Cedar filter is upstreamed to agentgateway's filter catalog, this exporter is the identity transform (Cedar stays Cedar) and we are in the compose case again. If the filter is not upstreamed, the exporter translates Cedar semantics into the upstream's preferred language with a loss budget (some Cedar `forbid` patterns may not have direct Rego analogues; the exporter logs warnings and forces the operator to acknowledge).
- The `policies/tools.cedar` file remains the source of truth. Users who switch gateways do not re-author policies; they re-run the exporter.

The replacement path is engineered so the Cedar posture survives even if opsbench-gateway does not.

## 7. Open questions

1. **GA timeline visibility.** agentgateway is pre-GA as of 2026-06-04, with the most recent activity on 2026-05-23 (per the catalog entry). The recommendation in § 4 hinges on when GA actually lands. Action: subscribe to the project's release feed, watch for a v1.0.0 tag or equivalent, and re-run this evaluation within two weeks of that signal. If a public roadmap with a target date appears in the meantime, fold it into the next F6 pass.
2. **Cedar plugin API surface.** Whether agentgateway stabilises on a native filter ABI (compiled-in or shared-object) or a WASM-filter path (load at runtime, sandboxed) materially changes the filter from § 5. WASM is more portable but pushes Cedar evaluation through a sandbox boundary with non-trivial performance cost; native is faster but couples filter releases to dataplane releases. We cannot pick between FFI and subprocess hosting cleanly without knowing which extension model the project commits to. Action: file an upstream question (or check the project's RFC/design tracker) before the next F6 pass.
3. **Pi compatibility.** The Pi-first mandate (parent roadmap § "Cross-cutting principles") requires every gateway path to support Pi's stdio/HTTP transport conventions and to integrate cleanly with `~/.pi/agent/AGENTS.md`. Does agentgateway support an MCP listener at `http://localhost:8765/mcp/<id>` shape? Does its filter-chain config allow per-upstream sub-path routing? Does it handle stdio-transport upstreams (some vendor MCPs, including `vault-mcp-server`, are stdio-only)? The F2 design assumes yes for all three because toolhive does; agentgateway's Envoy lineage makes streamable-HTTP a certainty but stdio-upstream support is unverified. Action: spike a 3-upstream proof-of-concept (one HTTP, one stdio, one mixed) against the most recent agentgateway release before committing either to the compose or the replace path.
