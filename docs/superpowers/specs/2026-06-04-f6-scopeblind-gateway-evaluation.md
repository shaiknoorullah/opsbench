# F6 — scopeblind-gateway architectural evaluation

**Status:** draft 2026-06-04 — awaiting reviewer approval
**Author:** Claude Code session (Shaik Noorullah, driver)
**Parent roadmap:** [`./2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md) (F6 § "Architectural evaluations & integrations", entry 4: `scopeblind-gateway`)
**Sibling evaluation hooks:** F6 entries 1 (`agentgateway`), 2 (`sympozium-ai/sympozium`), and 3 (`falcosecurity/prempti`) get their own design docs.
**Inputs:**

- [`./2026-06-04-f2-design.md`](./2026-06-04-f2-design.md) — `opsbench-gateway`: the Go fork of `stacklok/toolhive` with a Cedar evaluator and a JSON-Lines custody writer.
- [`./2026-06-04-f3-design.md`](./2026-06-04-f3-design.md) — Signed-receipts (evidence v2). F3 explicitly adopts the scopeblind-gateway receipt shape; `receipt.v1.json` is the opsbench codification of that shape.
- [`../research/2026-06-04-ecosystem-catalog.md`](../research/2026-06-04-ecosystem-catalog.md) — catalog entry for `tomjwxf/scopeblind-gateway` (MIT, 8★, last activity 2026-04-11). Tagged as the "near-exact opsbench analog" and placed on the watch list rather than the bulk-ship list.

## 1. What is scopeblind-gateway?

`tomjwxf/scopeblind-gateway` is a single-binary, single-host MCP proxy whose design centres on two ideas the wider ecosystem has been converging on for ~12 months: Cedar-evaluated authorization at the tool-call boundary, and cryptographically verifiable receipts emitted per call. An agent connects to the proxy as if it were an MCP server; the proxy parses the tool envelope, resolves the call against a Cedar policy bundle, forwards allowed calls to an upstream MCP, and writes a signed receipt for every decision (allow, deny, or error) to a JSON-Lines log file. The signing primitive is Ed25519 with a raw32 public key bound to a UUID `signer_id`; the canonical payload that gets signed is a deterministic JSON shape covering the tool name, hashed arguments, decision, Cedar context, and a parent-receipt hash for chained calls. The receipt format is intended to be verified offline against a published public key, without re-running the Cedar evaluator. The project is MIT-licensed, modest in scope (~8★, single-author cadence), and the catalog placed it on the watch list because the architectural shape — *not* the install base — is what matters.

The reason it sits on the F6 watch list rather than the F0 bulk-ship list is that scopeblind-gateway is not a vendor MCP we point at, and it is not a runtime we host. It is a *peer implementation* of the exact architecture opsbench-gateway (F2) plus signed receipts (F3) describe. opsbench-gateway started from `stacklok/toolhive` and added Cedar + custody; scopeblind-gateway started independently and arrived at the same primitive. The convergence is not a coincidence (catalog § 7.2 and § 7.3 trace the broader pattern: Cedar is winning the agent-authorization layer, MCP gateways are emerging as a category, and the gateways increasingly sign their decisions). That convergence is the *reason* F6 needs an explicit relationship decision: when two projects implement the same primitive in different languages, "do nothing" is itself a choice with long-term cost.

## 2. How does it overlap with opsbench?

The direct overlap is the F2+F3 stack:

| Surface | opsbench-gateway (F2 + F3) | scopeblind-gateway |
|---------|----------------------------|--------------------|
| Transport | MCP stdio + streamable HTTP | MCP stdio + HTTP |
| Authorization model | Cedar (via `cedar-go`) | Cedar (own evaluator binding) |
| Policy bundles | `tools.cedar` + `tools-generated.cedar` from F1 | Single Cedar bundle directory |
| Audit log shape | JSON-Lines, additive `schema_version` field | JSON-Lines, signed every line |
| Signing algorithm | Ed25519, raw32 pubkey | Ed25519, raw32 pubkey |
| Canonical payload | Deterministic JSON, sorted keys, no whitespace | Deterministic JSON, sorted keys, no whitespace |
| Chained receipts | `parent_receipt_sha256` (F3 § 3.9) | `parent_receipt_sha256` (same field name) |
| Verifier | Bash + Go subcommand; reads pubkey map | Single Rust CLI; reads pubkey map |
| Key bootstrap | `scripts/install.sh` ensures Ed25519 keypair in `~/.config/opsbench/keys/` | First-run wizard ensures keypair in `~/.config/scopeblind/keys/` |
| Distribution | Docker image + statically-linked Go binary (F2 § 8) | Cargo install + scratch Docker image |
| Language | Go (toolhive heritage) | Rust |
| License | MIT (opsbench) atop Apache-2.0 (toolhive heritage) | MIT |

That is a near-isomorphic overlap on the policy + audit primitive. The differentiators sit one layer up:

- **opsbench-gateway is opsbench's policy primitive.** It is the choke-point the F4 team packages compose against. It is the surface the installer drops next to the user's shell. It is the place `tools-generated.cedar` (F1) lands. It is the only place the team-incident-response runbooks know to call. Its shape is dictated by opsbench's broader product story — Pi-first multi-host, file-installed team packages, signed evidence baked into every recipe.
- **scopeblind-gateway is an independent project.** It does not (today) target opsbench's team-package surface, does not produce recipes for the catalog, does not bind to a Pi-first host story, does not vendor a CLI-Anything fallback, and does not ship a hooks-only path for hosts without native MCP. Its product story is "a paranoid MCP proxy" — single-purpose, language-agnostic, easy to run alongside any agent. That is *more* general than opsbench-gateway, not less.

The receipts schema is the one place the two projects already speak the same wire format byte-for-byte, by deliberate F3 choice (F3 § 1 calls this out explicitly: "we do not vendor scopeblind — we adopt the shape and fold it into opsbench-gateway"). Every other surface is parallel but not interoperable today: opsbench Cedar policies do not load in scopeblind's evaluator, opsbench `gateway.yaml` does not parse in scopeblind's config loader, opsbench's custody writer emits a slightly different JSON envelope (custody-log.v2 wraps the receipt with an `allOf` reference; scopeblind's writer emits the receipt directly).

The question this evaluation answers: given that the receipt format is already convergent and the rest of the surface is *deliberately* parallel, how should opsbench treat scopeblind-gateway over the next 12 months?

## 3. Three relationship options

### Option A — stay independent

opsbench ships F2 and F3 as planned. `docs/integrations.md` names scopeblind-gateway under "Gateways → related prior art" with a one-paragraph note pointing at its repository and confirming the receipt-shape alignment. No upstream PR is opened. No interop test is added. The two projects evolve on independent cadences and any future convergence is opportunistic.

**What this looks like in practice.** The F3 spec already references scopeblind-gateway as the pattern source for the receipt envelope. Option A formalises that as the *only* tie: a credit in the docs, nothing in the code. opsbench's `receipt.v1.json` schema sits at `opsbench.dev/schemas/receipt.v1.json` and is the opsbench-authoritative shape. scopeblind-gateway continues to evolve its own schema at whatever URL it currently uses. When the two schemas drift (because one project adds a field the other doesn't, or one tightens a regex), no one notices until somebody tries to take a receipt from one verifier into the other.

**Strengths.**

- Zero coordination cost; opsbench keeps full schema sovereignty.
- No risk of scope-creep into another project's roadmap during F2/F3 implementation.
- Aligns with parent-roadmap § "Standalone PRs": every change opsbench ships is independently revertable.
- Lowest implementation risk for the F-series itself; F6 entry becomes a docs-only change.

**Weaknesses.**

- Wastes the one coordination opportunity in the ecosystem where two projects *already* speak the same wire format.
- Drift over time is near-certain: opsbench will need to extend the receipt envelope for F4 team-specific signing identities and F6 chain-aggregation, and scopeblind has its own product pressures.
- Sends a "we co-opted your idea silently" signal to a small project; that is not the posture opsbench wants to set toward adjacent watch-list projects when the F-series catalog work depends on the broader ecosystem staying healthy.
- Forecloses option B without buying anything in return; once the schemas drift, the cost to re-converge later is much higher than the cost to coordinate now.

### Option B — contribute the receipt-format spec upstream (recommended; see § 5)

opsbench drafts the receipt envelope as a vendor-neutral specification — concretely the F3 `receipt.v1.json` schema plus the canonical-JSON contract (F3 § 3.2) plus an Ed25519 reference-fixture corpus — and contributes it to scopeblind-gateway as a *shared* spec. The artefact is a spec document plus the JSON Schema plus a fixture directory; it lives at a stable URL both projects reference, and the schema is renamed/relocated to a vendor-neutral identifier so neither project owns the canonical bytes. opsbench-gateway and scopeblind-gateway both validate against the same schema and produce receipts that the other's verifier accepts.

**What this looks like in practice.** opsbench opens a PR (or an upstream RFC if scopeblind-gateway has one) titled something like "Receipt envelope spec — convergent format with opsbench-gateway". The PR contents are:

1. The `receipt.v1.json` schema, *relocated* to a vendor-neutral URL (candidates: `agent-receipts.org/schemas/receipt.v1.json`, or a GitHub Pages site on a neutral org, or — if either side wants to push toward a longer-lived home — IETF I-D or CNCF Schemas; see open question 3).
2. The canonical-JSON contract from F3 § 3.2 written as a standalone spec section (independent of opsbench-gateway's Go code or scopeblind's Rust code).
3. A reference-fixture corpus: a set of receipt JSON files plus their expected canonical byte forms plus their expected Ed25519 signatures under a fixed test keypair. Both implementations validate against this corpus in CI.
4. A minimal compliance suite: a `receipts-compliance/` directory with a fixture runner script that verifies any implementation against the corpus. opsbench ships it in CI; scopeblind ships it in CI; future implementations (Pi-native, a Python audit library) drop into the same suite.

Operationally, the two projects keep their gateway code independent. They share only the wire format, which is the smallest reasonable unit of coordination. The opsbench-gateway test suite includes a scopeblind-gateway interop fixture: receipts produced by opsbench-gateway are run through scopeblind-gateway's verifier in CI, and vice versa. If the test ever fails, the schema is the single source of truth and the implementations converge to it.

**Strengths.**

- Locks in the convergence at the only layer that matters: the wire format.
- Vendor-neutral schema home means neither project owns the future — the spec can grow under multi-author governance.
- Builds the relationship asymmetrically in opsbench's favour: opsbench did the drafting work, so the spec carries opsbench's idioms (canonical-JSON contract from F3 § 3.2, parent-chain semantics from F3 § 3.9, key-rotation runbook patterns from F3 § 3.4).
- Future implementations (Pi-native signer, third-party audit tooling, a Python `agent-receipts` library) drop into a known wire format. The audit ecosystem grows around a shared bytes-level contract rather than two parallel ones.
- Aligns with the parent-roadmap principle "Vendor MCPs > custom code" generalised one level up: where a wire format already exists in the wild, we coordinate rather than re-implement.
- Reversible. If scopeblind-gateway does not accept the PR, opsbench still benefits from having extracted the spec into a vendor-neutral artefact; it can land at `schemas/receipts.opsbench.dev/` and other implementations can adopt it later.

**Weaknesses.**

- Non-trivial coordination cost: opsbench has to draft the spec carefully, negotiate the schema URL, and stay engaged through the upstream review.
- If scopeblind-gateway has no contribution process (small project, single author), the PR may sit. The fallback (a vendor-neutral home under opsbench control) is fine but does not buy as much.
- Adds an interop test surface to opsbench's CI. If scopeblind's verifier changes incompatibly, opsbench's CI starts flagging — that is the price of interop.
- Slightly delays F3's "ship it" moment: the schema URL needs to settle before F3 PRs land, or the schema relocates after F3 lands (which is doable — F3 § 5 only requires that the schema validate, not that it live at a specific URL).

### Option C — merge: retire opsbench-gateway and adopt scopeblind-gateway upstream

opsbench-gateway is retired before it ships. opsbench contributes the Cedar evaluator wiring, the custody-log writer, the Pi-compat layer, the team-package integration story, and the installer bootstrap to scopeblind-gateway upstream. opsbench's gateway-shaped surface becomes a thin opsbench-flavoured profile of scopeblind-gateway. The F2 spec is retracted; F3 becomes a scopeblind-gateway PR series; F4 team packages depend on `scopeblind-gateway >= X.Y` directly.

**What this looks like in practice.** The F-series rearranges substantially. F2 collapses to "contribute Cedar evaluator + custody.log + Pi compat to scopeblind-gateway". F3 collapses to "contribute the signed-receipt format to scopeblind-gateway upstream — already partly there". F4 team packages reference scopeblind-gateway in their recipes instead of opsbench-gateway. The opsbench installer either bundles scopeblind-gateway as a vendored binary or installs it via `cargo install`. The `packages/opsbench-gateway/` directory either disappears entirely or becomes `packages/opsbench-gateway-profile/` holding only a `gateway.yaml` template and opsbench-flavoured Cedar policies.

**Strengths.**

- Maximum convergence: one binary, one wire format, one verifier across two project communities.
- Eliminates the maintenance burden of keeping toolhive in sync (F2 § "Why fork toolhive" notes monthly upstream merge cadence; merging into scopeblind sheds that entirely).
- Sends the strongest possible "we are part of the ecosystem" signal. For a project staking out the policy + evidence layer as its identity, merging upstream into a smaller-but-aligned peer is the most credible move.
- Forces opsbench to draw a sharp line between "gateway primitive" (now upstream) and "opsbench-specific composition" (recipes, team packages, hooks, installer) — that line is good engineering hygiene regardless of the merge outcome.

**Weaknesses.**

- Premature. opsbench-gateway is being designed *right now* (F2 is a draft spec, not shipped code). Merging into scopeblind-gateway before opsbench-gateway proves its own shape forces opsbench's design decisions to fit scopeblind's existing code organisation, which has not been audited against opsbench's needs.
- Language mismatch: scopeblind-gateway is Rust; opsbench's broader stack (installer, hooks, team-package validators) is Bash + Go + Node. Merging into Rust means opsbench takes on Rust as a primary stack component, which the F-series did not budget for and the team has not consented to.
- Single-maintainer upstream. scopeblind-gateway is one author, 8★, sub-monthly cadence. Tying opsbench's primary policy primitive to that bus factor is risky — and asking the upstream author to absorb opsbench's scope (Cedar generator integration, Pi-compat, custody-log v2, team-package contracts) is asking a lot.
- Re-opens already-settled F2 decisions (toolhive fork, Go implementation, vendoring strategy) and would require F2 to be re-spec'd from scratch.
- Loses opsbench's ability to ship `gateway.yaml` semantics, custody-log v2, and Cedar generator integration on opsbench's cadence; upstream PRs gate everything.
- Aligns poorly with the parent-roadmap § "Dependency graph": F4 team packages depend on F2 landing on opsbench's timeline, not on a third party's review queue.

### 3.4 What each option implies for F4 team packages

The F4 team-package work (parent roadmap § F4) depends on the gateway primitive being in place. Each option above changes what the F4 teams reference in their recipes and what their custody-log examples look like:

- **Option A.** F4 teams reference `opsbench-gateway` exclusively. scopeblind-gateway does not appear in any team-package documentation. If a user of `team-incident-response` also happens to run scopeblind-gateway elsewhere in their stack, they manage two separate evidence trails.
- **Option B.** F4 teams still reference `opsbench-gateway` as the recommended gateway, but each team's "Gateways" section in its README links the shared spec and notes that scopeblind-gateway produces interoperable receipts. A user who already runs scopeblind-gateway can verify F4-produced receipts with their existing tooling, and vice versa. The team-package recipes do *not* gain a "scopeblind-gateway config" section — that would be scope creep into another project's documentation surface — but the receipt format is acknowledged as portable.
- **Option C.** F4 teams reference `scopeblind-gateway` directly. Every recipe's "Configuration" block names scopeblind-gateway as the install target. The opsbench-flavoured profile (if it exists as a thin layer) is mentioned, but the primary binary the user installs is scopeblind's. This means the F4 teams have a non-opsbench dependency on their install path — a step the F-series has otherwise avoided where possible.

The F4 implication is one of the strongest arguments for Option B specifically: it gives users the *option* of interop without forcing the team packages to take a hard dependency on a third project's release cadence.

### 3.5 What each option implies for F5 (Pi-first multi-host)

The F5 phase brings Pi to parity with Claude Code and ships the installer matrix (Homebrew / AUR / Nix). Each option above lands differently on F5:

- **Option A.** opsbench-gateway is what the Pi-first install brings down. scopeblind-gateway is not surfaced to Pi users at all.
- **Option B.** opsbench-gateway is the default install target on Pi (and on the other hosts). The Pi recipe lead block mentions the shared receipt format and the fact that audit tooling written against the spec works on Pi-produced receipts. This is a documentation expansion, not a code one.
- **Option C.** scopeblind-gateway becomes the installed binary on every supported host, including Pi. The Pi-compat layer (which F5 invests in heavily — `tools/pi-compat-layer/` with Pi-native skill manifests, hooks adapter, marketplace listing) now has to coordinate with scopeblind-gateway's release cadence. A Pi-specific configuration profile would still be shipped by opsbench, but the binary lifecycle is upstream-owned.

Option C's F5 implication is particularly load-bearing because Pi-first is one of the strongest commitments in the parent roadmap. Tying Pi's primary policy primitive to an upstream project's release cadence is a much bigger commitment than tying it to opsbench's own. This is the second-strongest argument against Option C (after the "premature design" argument in § 3 above).

### 3.6 Licensing posture and notice obligations

All three projects involved are MIT-licensed (opsbench, opsbench-gateway's MIT-on-Apache-2.0-base, scopeblind-gateway pure MIT). The license posture under each option:

- **Option A.** No copying of code or schemas between projects. F3 cites scopeblind-gateway as the pattern source in the spec doc — that is *attribution*, not a license obligation, but it is good practice. The schema text at `opsbench.dev/schemas/receipt.v1.json` is opsbench's own draft against the JSON Schema 2020-12 standard; no scopeblind material is incorporated.
- **Option B.** The spec PR contributes opsbench-drafted text to scopeblind-gateway's repo (or to a neutral org). The drafted text is opsbench's, so opsbench is the contributor; scopeblind gains co-author status via merge. The compliance corpus is jointly authored. Both projects' MIT licenses cover the spec text under whatever license the neutral home elects (CC0 or CC-BY-4.0 are common for vendor-neutral specs; MIT is acceptable but less idiomatic for a wire-format spec). Reviewer's call on which license the neutral home adopts.
- **Option C.** Substantial code contribution from opsbench's side into scopeblind-gateway. The opsbench code's MIT license is compatible with scopeblind's MIT, so the contribution is straightforward. The reverse direction (vendoring scopeblind code into opsbench-gateway) would also be MIT-on-MIT and clean. No notice or attribution complications, but there is real legal-housekeeping work to attribute commits and contributors correctly across project boundaries.

The licensing analysis does not strongly favour any one option; all three are clean. The note here is mostly forward-looking: if Option B's neutral home ever wants to migrate to a longer-lived standards process (open question 3), the spec text's license needs to be compatible with that process's IPR policy. IETF I-D submissions accept CC-BY-4.0 and Apache-2.0; CNCF Schemas accepts MIT and Apache-2.0. Choosing the neutral-home license thoughtfully up-front prevents a re-license campaign later.

## 4. Decision matrix

| Dimension | Stay independent (A) | Contribute spec (B) | Merge (C) |
|-----------|----------------------|---------------------|-----------|
| Coordination cost | 0 | Medium (one spec PR + ongoing interop test) | Very high (re-spec F2, language change, ongoing upstream coordination) |
| Wire-format convergence | None — drift expected | Full — by construction | Full — same binary |
| opsbench schema sovereignty | Full | Shared with neutral home | Yielded to upstream |
| Risk to F2/F3 timeline | None | Low (spec drafting can parallelise) | High (F2 must be re-spec'd) |
| Bus factor | opsbench-only | opsbench + scopeblind + future implementers | scopeblind upstream maintainer |
| Aligns with "Vendor MCPs > custom code" | Weak — re-implements a wire format | Strong — coordinates a shared format | Strong but premature |
| Ecosystem signalling | Weak — silent adoption | Strong — explicit collaboration | Maximal — full merge |
| Reversibility | Trivial | Easy (spec stands on its own) | Hard — would need to re-fork |
| F4–F6 unblocked on opsbench's schedule | Yes | Yes | No — upstream queue dependency |

## 5. Recommended relationship — Option B

The recommendation is **Option B: contribute the receipt-format spec upstream**, with a fallback to a vendor-neutral schema home if scopeblind-gateway's contribution channel is too thin to absorb the PR.

The justification is three-pronged:

**Schema interop is a clear, immediate win.** Both projects already speak the same Ed25519-signed receipt shape. The cost of writing the spec down once, putting it at a vendor-neutral URL, and adding an interop test in each project's CI is small and bounded. The benefit — that opsbench-gateway receipts verify in scopeblind-gateway and vice versa, that a third-party audit library can be written against a single specification, that future implementations (Pi-native, Python, a Java SDK someone might write) have a single reference — compounds over time. The convergence is the entire reason scopeblind-gateway landed on opsbench's watch list in the first place; coordinating on the one layer that's already convergent is the cheapest possible step that preserves that value.

**Merging the gateways (option C) forces premature design decisions.** opsbench-gateway has not yet been built. F2 is a draft spec; F3 layers on top of it. The "Cedar evaluator + custody.log + Pi compat" surface that option C wants to push upstream does not exist yet in code form — it is still being designed against opsbench's specific needs (toolhive heritage, Go language, Pi-first multi-host, team-package integration, MIT/Apache-2.0 license posture). Merging into scopeblind-gateway before that surface is built and proven inverts the normal sequence: scopeblind would have to accept architectural decisions opsbench has not yet validated for itself. That is a recipe for either (a) opsbench's needs getting smoothed away to fit scopeblind's existing organisation, or (b) opsbench effectively rewriting scopeblind's internals to accommodate. Neither outcome is good. The parent roadmap's dependency graph also treats F2's timing as load-bearing: F4 teams cannot ship until F2 ships, and F2 cannot ship on opsbench's schedule if its review queue is gated by a different project's maintainer.

**Staying fully independent (option A) wastes a coordination opportunity.** opsbench's F-series identity is the policy + evidence layer. The receipt is the *evidence* part. Letting the receipt format drift across two implementations that share a clear pattern source is bad for the audit ecosystem opsbench is positioning around. It also sends a "silent adoption" signal to a small project whose architectural alignment is exactly what made it watch-list-worthy. The marginal cost of option B over option A is one upstream PR plus a small CI interop matrix; the marginal benefit is the format converges by construction, the schema gains a vendor-neutral home that is portable to longer-lived standards bodies if it ever needs to be, and opsbench gets credited as a co-author of the spec rather than a silent adopter.

Option B is also the only one of the three that is *reversible at low cost*. If the spec PR stalls upstream, opsbench publishes the schema at a neutral URL under its own control and lands F3 against that. If the spec PR succeeds and scopeblind-gateway grows in a direction that opsbench cannot follow, the spec stays at the neutral URL and the two implementations drift on the *implementation* layer while keeping the *wire format* layer stable. Either way the spec artefact has value.

## 6. If Option B: concrete integration plan

This section is the implementation plan that follows from accepting Option B. It is intentionally light on code — F6 evaluations do not commit to implementation in the same PR — but it is specific about the contents of the upstream contribution.

### 6.1 Upstream PR contents

The PR (or RFC, depending on scopeblind-gateway's process — see open question 2) contains:

1. **`receipt.v1.json` relocated to a vendor-neutral URL.** Candidates, in order of preference:
   - `https://agent-receipts.dev/schemas/receipt.v1.json` (new dedicated domain, hosted on GitHub Pages from a neutral org; cheapest to set up).
   - An IETF draft slot once the spec stabilises (`agent-receipt-envelope-00`, see open question 3).
   - As a fallback, `https://opsbench.dev/schemas/receipt.v1.json` with a `note` field in the schema acknowledging joint authorship.
   The schema content is the F3 schema unchanged. Only the `$id` and the description are revised.
2. **The canonical-JSON contract, written as a standalone normative section.** Lifted from F3 § 3.2 and rewritten to drop the opsbench-internal references. The contract enumerates the deterministic JSON form rules (key sort at every depth, no insignificant whitespace, UTF-8, integer formatting, escape handling), the four signature-envelope fields excluded from the canonical form (`signature`, `signed_at`, `signed_payload_canonical_sha256`, `signer_pubkey_fingerprint`), and the SHA-256 + Ed25519 sign sequence.
3. **A reference-fixture corpus** under a new `receipts-compliance/` directory:
   - `fixtures/receipt-minimal.json` — the smallest legal receipt with only required fields populated.
   - `fixtures/receipt-allow-with-context.json` — a typical allow case with Cedar context populated.
   - `fixtures/receipt-deny-with-rule-id.json` — a deny case with `deny_reason` and `matched_rule_ids`.
   - `fixtures/receipt-chained.json` — a child receipt populating `parent_receipt_sha256`.
   - `fixtures/receipt-rotated.json` — a receipt signed under a `signer_id` whose pubkey must be resolved via a key-map.
   - `fixtures/test-keypair.{priv,pub,id}` — a fixed Ed25519 keypair distributed *only* as test material (the public key fingerprint is documented; the private key is published deliberately so test signatures can be reproduced).
   - For each fixture: `fixtures/<name>.canonical.bin` (the expected canonical byte stream) and `fixtures/<name>.signature.hex` (the expected Ed25519 signature).
4. **A minimal compliance runner** at `receipts-compliance/run.sh` (Bash + jq + openssl, no toolchain assumptions) that:
   - For every fixture, recomputes canonical bytes, compares against `<name>.canonical.bin`.
   - Recomputes the SHA-256 of the canonical bytes, compares against `signed_payload_canonical_sha256` in the fixture.
   - Verifies the Ed25519 signature against the canonical bytes using the test public key.
   - Exits 0 on full pass, non-zero with a per-fixture diff on any failure.
5. **CI matrix entries.** Both opsbench-gateway and scopeblind-gateway add a `receipts-compliance` job to their CI that runs `receipts-compliance/run.sh` against the corpus. New implementations are encouraged to do the same.
6. **A NOTICE / AUTHORS section in the spec** crediting scopeblind-gateway as the pattern source and opsbench as the spec drafter, with both projects listed as co-implementers.

### 6.2 RFC process (if scopeblind-gateway has one; otherwise PR)

scopeblind-gateway's repository does not advertise a formal RFC process at the time of this evaluation. The pragmatic path is:

- Open an issue first, scoped to "should the receipt envelope live in a vendor-neutral spec?" — gauge maintainer appetite before committing to PR work.
- If the maintainer agrees in principle, open the spec PR with the contents listed in § 6.1.
- If the maintainer prefers to keep the schema under scopeblind-gateway's URL, opsbench falls back to publishing the schema at a neutral URL and referencing scopeblind's URL as an alias — the wire format still converges, just under a different naming.
- If the maintainer does not respond within a documented review window (60 days), opsbench publishes at the neutral URL and proceeds.

### 6.3 opsbench-gateway interop test suite addition

Independently of the upstream PR, opsbench-gateway gains a new CI matrix entry:

- Pull the latest tagged `scopeblind-gateway` binary into a CI image (`cargo install scopeblind-gateway --version <pinned>`).
- Have opsbench-gateway produce a fixture custody.log against the standard F3 test workload.
- Run `scopeblind-gateway custody verify <fixture>` (or whatever its verifier subcommand is named) against that log.
- Assert exit 0.
- Symmetrically, take a scopeblind-gateway-produced receipt log and run `opsbench-gateway custody verify-signatures` (F3 § 3.7) against it.
- Assert exit 0.

This interop test is the load-bearing evidence that the format has stayed convergent. It is the regression net that catches schema drift early. It is independent of whether the upstream spec PR has been accepted — opsbench can write the test against whichever scopeblind-gateway version it pins, and the test will tell us if and when the formats diverge.

### 6.4 Documentation updates

- `docs/integrations.md` gains a "Gateways → interop" subsection that names scopeblind-gateway, links the shared spec URL once landed, and explains the interop test.
- `packages/opsbench-gateway/README.md` gains a "Wire-format interop" section pointing at the spec and the compliance runner.
- The F3 spec doc is *not* rewritten — it already references scopeblind-gateway as the pattern source. F3 ships unchanged; the upstream PR is downstream of F3 landing.

### 6.5 Sequencing relative to F2 and F3

- F2 ships first; the gateway exists.
- F3 ships next; the receipt format exists in opsbench code form, validated by opsbench CI.
- The upstream PR opens after F3 lands. opsbench has running code by then, which is the strongest position to negotiate a shared spec from.
- The interop test (§ 6.3) lands in opsbench-gateway concurrently with the upstream PR — it does not require the upstream PR to be accepted; it requires only that both implementations agree on the wire bytes.

The sequencing means F6 entry 4 (this doc) becomes an *executed* phase only after F3 ships. Before that it is a published evaluation that establishes the intent.

### 6.6 Fallback paths

The integration plan has two natural fallback positions that preserve most of the value if the upstream PR cannot land cleanly:

- **Fallback A — neutral home only.** If scopeblind-gateway does not accept the schema relocation (silent maintainer, scope disagreement, or aesthetic difference about which canonical-JSON rule applies to a corner case), opsbench publishes the spec at the neutral URL anyway. The schema, the canonical-JSON contract, and the compliance corpus all stand on their own. scopeblind-gateway's receipts can still be verified against the corpus — the wire bytes are the wire bytes — and any future implementation that *does* want to align has a clear target.
- **Fallback B — one-way interop only.** opsbench-gateway's CI continues to import scopeblind-gateway as a verifier-of-last-resort and asserts that opsbench-generated receipts verify under scopeblind's tool. If scopeblind diverges later (adds a field opsbench does not emit, tightens a regex), opsbench's CI catches it and surfaces the divergence as a review item — at which point opsbench either follows the divergence or pins the scopeblind version. This is weaker than fallback A but cheaper still.

Both fallbacks are bounded: at no point does opsbench's roadmap depend on the upstream PR being merged. F3 ships independently; the interop test ships independently; the spec stands at a neutral URL regardless. The PR is the *preferred* outcome, not the load-bearing one.

### 6.7 What we explicitly do NOT take on

To keep this evaluation tightly scoped, the following are explicit non-goals of Option B:

- **Sharing implementation code.** No vendored Rust modules in opsbench-gateway, no vendored Go modules in scopeblind-gateway. The shared surface is the wire format and the compliance corpus, period.
- **Sharing Cedar policies.** opsbench's `tools-generated.cedar` (F1) and `tools.cedar` are opsbench-specific composition. scopeblind-gateway's Cedar bundle is scopeblind's. The Cedar schema convergence is at the language level (Cedar itself), not at the policy level.
- **Sharing custody-log file layout.** opsbench's `custody-log.v2.json` wraps the receipt in an `allOf` with a constant `schema_version`; scopeblind's writer emits the receipt directly. Both are valid against the shared receipt schema. The file-layout difference is an implementation choice neither project should constrain on the other.
- **Sharing key-bootstrap or key-rotation logic.** opsbench's `scripts/install.sh` ensures keys in `~/.config/opsbench/keys/`; scopeblind's wizard ensures them in `~/.config/scopeblind/keys/`. The fingerprint format is shared (because it is in the receipt envelope), but the on-disk paths and the rotation runbook stay project-specific.
- **Sharing a verifier binary.** Each project keeps its own verifier — opsbench ships Bash + Go, scopeblind ships Rust. The compliance corpus is what guarantees they produce the same answers; the binaries themselves do not need to converge.
- **Sharing the mirror / offsite-storage layer.** F3's S3 / Azure Blob / GCS mirror (F3 § 3.8) is opsbench-only; scopeblind has its own opinions about offsite storage. Receipts written to either project's mirror are interoperable because the wire format is shared, but the mirror configuration surface is not.

The non-goals matter because they bound the scope of the upstream PR. "Receipt format spec" is a small, well-defined artefact; "shared gateway implementation" is not. Keeping the goals narrow is what makes Option B reversible and low-cost.

### 6.8 Success criteria for the executed phase

When F6 entry 4 is actually executed (post-F3), the success criteria are:

1. The spec document exists at a stable, vendor-neutral URL with a documented governance model (open question 3).
2. opsbench-gateway's CI runs the `receipts-compliance` runner against the corpus and exits 0.
3. opsbench-gateway's CI runs a `scopeblind-gateway` interop test (§ 6.3) and exits 0 against the pinned scopeblind version.
4. `docs/integrations.md` references the shared spec under "Gateways → interop".
5. At least one upstream artefact exists — either a merged PR in scopeblind-gateway, or an acknowledged issue with the maintainer's position recorded, or a documented fallback decision pointing at the neutral schema URL.
6. opsbench-gateway's README's "Wire-format interop" section is present and accurate.

These criteria are intentionally light on "scopeblind-gateway must accept the PR" — the success of Option B does not depend on the upstream merge, only on the spec existing in a usable form and on opsbench's tooling proving the interop holds.

## 7. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Upstream maintainer does not respond to the spec PR or issue within a reasonable window | Medium | Low | Documented 60-day review window in § 6.2. After window, opsbench publishes the spec at the neutral URL anyway (fallback A in § 6.6). The interop test in opsbench's CI keeps the wire bytes converged regardless of upstream merge status. |
| scopeblind-gateway diverges its schema after the spec lands (adds a field, tightens a regex) | Medium | Medium | opsbench-gateway CI runs the scopeblind interop test against a pinned scopeblind version; divergence trips the pin-bump. opsbench reviews the divergence and either follows it (issue a spec amendment) or stays at the pinned version with the divergence documented. The compliance corpus is the arbiter — whichever side fails the corpus is the one that drifted. |
| Spec text written under MIT/Apache-2.0 cannot migrate to a longer-lived standards process | Low | Medium | Choose a neutral-home license up-front that is compatible with both IETF and CNCF Schemas paths (CC-BY-4.0 is a safe default; Apache-2.0 is also fine for both). Open question 3 specifies governance; this is a sub-decision under it. |
| Canonical-JSON contract differs at corner cases between Go and Rust implementations | Medium | High | The compliance corpus is the single source of truth. Each fixture has expected canonical bytes; both implementations run the corpus in CI. If either fails, the corpus wins — both implementations must converge to it. The corpus covers known corner cases (Unicode escapes, integer edges, null fields, empty arrays, nested objects, key-ordering with similar prefixes). New corner cases get added to the corpus, not patched in code first. |
| opsbench commits to Option B and scopeblind-gateway is later abandoned | Medium | Low | The spec stands on its own at the neutral URL. Future implementations adopt against the spec, not against scopeblind. opsbench's interop test pins a specific scopeblind version, so abandonment freezes the interop net rather than breaking it. The opsbench-gateway code path is unaffected. |
| Reviewer prefers Option A or Option C after reading this doc | High | None | This is a feature, not a bug. The recommendation in § 5 is just that — a recommendation. Open question 1 in § 8 surfaces alternative paths explicitly. The decision matrix in § 4 is the artefact reviewers use to substitute their own weights and arrive at a different conclusion. |
| Schema URL `agent-receipts.dev` is unavailable or undesirable as a default | Low | Low | Three candidate URLs are listed in § 6.1; the choice is an open question (3) rather than a hard commitment. Fallback to `opsbench.dev/schemas/receipt.v1.json` with a "joint authorship" note is always available. |
| Compliance corpus grows unboundedly as new corner cases are discovered | Medium | Low | The corpus is versioned with the spec. A corpus entry that requires a spec amendment also requires a SemVer bump (under the governance proposed in open question 3). Implementations declare which corpus version they pass; older versions are not retro-mutated. |
| Two implementations passing the corpus does not guarantee bit-for-bit identical receipts in the field | Low | Medium | The corpus is necessary but not sufficient. The opsbench-gateway → scopeblind-gateway interop test (§ 6.3) is the production-shaped check: receipts produced by one verifier-validate in the other. Both checks are required to land for the executed phase to succeed. |
| The spec PR drags opsbench reviewers into upstream scopeblind-gateway discussions for an extended period | Medium | Low | Time-box opsbench's engagement: 60-day review window in § 6.2, after which opsbench falls back to the neutral URL. The interop test is independent of the PR outcome, so opsbench's running code is not blocked. |

## 8. Open questions for reviewer

1. **Schema home.** Three real options for the vendor-neutral URL: a dedicated `agent-receipts.dev` domain (cheap, single-author governance unless we explicitly set up a multi-author org); an IETF Internet-Draft slot (slow, formal, but durable — would take 12–18 months); a CNCF Schemas-hosted spec (would require the CNCF Schemas project to be willing, which is a separate negotiation). The default in this doc is the dedicated domain, with a path to IETF if traction warrants. Reviewer's call on whether to commit to the longer path up-front.
2. **Upstream contribution channel.** scopeblind-gateway does not advertise a formal RFC process. Should opsbench's first step be (a) open an issue gauging maintainer interest, (b) open the PR cold with the spec ready, or (c) reach out to the maintainer privately first? Default in this doc: (a) issue first. Reviewer may have a preference based on their own open-source-ecosystem norms.
3. **Receipt-format ownership long-term.** Even if the spec lands under a vendor-neutral home, governance has to be specified: who can merge changes, what is the versioning cadence, what is the deprecation policy? Default in this doc: open the spec under a 2-of-3 multi-author org (opsbench + scopeblind + one independent reviewer), versioned with SemVer-ish (`v1.x.y` additive only; `v2` breaking-change bumps require both opsbench and scopeblind sign-off plus a 90-day deprecation window on `v1`). Reviewer may prefer a lighter governance shape now and a heavier one later (e.g. "ad-hoc until breaking change is needed"). This is the single most consequential of the three open questions — it locks in the long-term shape of the audit ecosystem opsbench is positioning around.
