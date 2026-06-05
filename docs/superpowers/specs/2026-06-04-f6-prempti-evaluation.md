# F6 — prempti architectural evaluation

**Status:** draft 2026-06-04 — awaiting reviewer approval
**Author:** Claude Code session (Shaik Noorullah, driver)
**Parent roadmap:** [`./2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md) (F6 section)
**Related specs:**

- [`./2026-06-04-f3-design.md`](./2026-06-04-f3-design.md) — the F3 signed-receipt and custody-log surface this evaluation extends.
- [`./2026-06-04-f2-design.md`](./2026-06-04-f2-design.md) — the userspace gateway whose enforcement boundary prempti is being evaluated to extend downward.

## 1. Purpose

Decide whether opsbench should treat `falcosecurity/prempti` (a runtime kernel-syscall enforcement boundary for AI agent tool calls, surfaced by the ecosystem catalog) as a default companion installed alongside opsbench-gateway on Linux clusters, an opt-in companion, or an unbundled third-party recommendation. The decision matters because opsbench's existing Cedar evaluation, gateway routing, and signed-receipt evidence chain all live in **userspace**. A sufficiently sophisticated attacker who reaches the agent process — through a compromised MCP server, a prompt-injection that talks the agent into running a shell, or a supply-chain compromise of a Python dep — can bypass every userspace boundary opsbench enforces, because the agent process can directly `execve` whatever it wants. prempti closes that gap by enforcing at the **kernel** layer: even if userspace lies, the syscall does not happen unless prempti's policy permits it.

This evaluation answers three questions, in order:

1. **What is prempti, factually, in the shape that the catalog surfaced and that we have verified against the project's documented architecture?**
2. **What does the trust-boundary picture look like when opsbench-gateway and prempti both run?**
3. **Of three plausible relationships (recommended add-on / opt-in default / always-on requirement), which is the right default for opsbench, and what concretely changes in the codebase if we ship it?**

## 2. What is prempti?

`falcosecurity/prempti` is a runtime enforcement layer that sits between an AI agent process (Claude Code, Codex CLI, a Pi-hosted agent, an in-cluster autonomous worker, etc.) and the Linux kernel. It is part of the Falcosecurity org — the same upstream that ships Falco (the CNCF runtime-security project) — and it composes with Falco's existing eBPF-backed kernel observability stack. Where Falco *observes* syscalls and raises alerts when something matches a rule, prempti *gates* syscalls and refuses to let the call complete unless an attached policy allows it. The unit of policy is "this process (or pod, or cgroup) may invoke this tool, against this resource, via this syscall path." That phrasing maps almost directly onto how opsbench thinks about MCP tool calls today: Cedar policies express "this agent class may invoke this tool, against this resource, with these arguments." prempti is the natural defense-in-depth layer beneath Cedar because it answers the same question, but from inside the kernel, where userspace's word is no longer trusted.

prempti's enforcement mechanism is pre-syscall — it does not let the call reach the kernel handler before deciding. That is significantly stronger than `post-tool-use`-style audit hooks, which can only describe what already happened. It is also stronger than `pre-tool-use` hooks living in userspace (the gateway's Cedar evaluation, the installed PreToolUse hooks), because those run inside the agent's address space and can be bypassed by an attacker who has gained code execution in that address space. prempti's policy is administered by the host operator, not the agent, so a compromised agent cannot relax its own constraints. The cost: a Linux kernel is required, prempti's userspace daemon must be running, and the policy authoring surface is unfamiliar to operators who only know Cedar today. The catalog characterised this as "the natural defense-in-depth layer beneath Cedar" — that framing is correct, and it is the framing this evaluation uses.

## 3. Overlap with opsbench's existing layers

opsbench, as of F0–F3, runs three layers of enforcement-or-evidence that all live above the kernel:

| Layer | Where it runs | What it decides | Strong vs. weak boundary |
|-------|---------------|-----------------|--------------------------|
| **Cedar policy** (F1) | Userspace inside the gateway process | Whether an MCP tool call is permitted, given agent class, tool name, resource, arguments | Strong against well-behaved agents; weak against compromised agents that bypass the gateway |
| **opsbench-gateway** (F2) | Userspace process, separate from the agent | Routes MCP calls; emits custody log; enforces Cedar decisions | Strong as long as the agent talks to MCP via the gateway; bypassed if the agent uses raw `execve` to call a tool's CLI directly |
| **Signed receipts** (F3) | Userspace inside the gateway and the PostToolUse hook | Cryptographic evidence of what happened, after the fact | *Evidence*, not enforcement — answers "can I prove this?", not "can I prevent this?" |

Each layer assumes the layer beneath it is intact. Cedar trusts that the gateway evaluator runs Cedar over the actual tool call. The gateway trusts that the agent routes through it. The receipt chain trusts that the writer is honest. In a normal incident-response posture, those assumptions hold. In a hostile posture — a prompt-injection chain that talks the agent into shelling out, a compromised dependency that intercepts the gateway client, a process that links against the agent runtime and patches the routing — they do not. The kernel is the last layer that *cannot* be bypassed from userspace. prempti enforces there.

### 3.1 Defense-in-depth picture with prempti added

```text
                ┌──────────────────────────────────────────────────────────┐
                │                  agent runtime (userspace)               │
                │ ┌──────────┐    ┌─────────────────┐    ┌──────────────┐  │
agent message ─▶│ │  agent   │───▶│  MCP client SDK │───▶│  gateway     │  │
                │ │ skill    │    │                 │    │  Cedar eval  │  │
                │ └──────────┘    └─────────────────┘    └──────┬───────┘  │
                │                                                │         │
                │                                                ▼         │
                │                                       custody writer +   │
                │                                       F3 signed receipt  │
                └────────────────────────────────────────────────┬─────────┘
                                                                 │
                                          ─────── syscall layer  │ ─────────
                                                                 ▼
                            ┌────────────────────────────────────────────┐
                            │       prempti pre-syscall enforcement      │
                            │   (Falcosecurity, eBPF + LSM hooks)        │
                            │                                            │
                            │   policy:                                  │
                            │     - what cgroup / process / pod          │
                            │     - what syscall family (execve/connect) │
                            │     - what target resource (path/IP)       │
                            │                                            │
                            │   decision: allow / deny / log             │
                            └────────────────────────────┬───────────────┘
                                                         │
                                          ─────── kernel │ ─────────────────
                                                         ▼
                                                  kernel handler
                                                         │
                                                         ▼
                                                target tool / fd / socket
```

The trust-boundary statement is now: **a compromised agent that bypasses opsbench-gateway is still bounded by prempti.** That is the property F6 is being asked to evaluate adopting.

### 3.2 What overlaps, what does not

prempti and opsbench-gateway are not duplicates. They answer related questions at different layers:

| Concern | opsbench-gateway (userspace) | prempti (kernel) |
|---------|------------------------------|------------------|
| Policy expressiveness | Cedar — rich, attribute-based, resource-typed | Syscall-shaped — coarser, process/cgroup/path-shaped |
| Bypass surface | Bypassable by raw `execve` or by patching the gateway client | Not bypassable from userspace (short of a kernel exploit) |
| Audit surface | Rich custody log: tool name, redacted args, response hash, decision | Syscall-level: which syscall, which target, which cgroup, allow/deny |
| Latency | <100ms p95 round-trip (F2 budget) | Sub-microsecond per check at the kernel level |
| Policy authoring | Recipe-driven `tools-generated.cedar` + hand `tools.cedar` | Operator-authored Falco-style rules + (proposed) generator from Cedar |
| What it protects against | Misbehaving but well-formed MCP calls | Misbehaving agents that abandon MCP entirely |
| Mode of failure | Fails closed if Cedar denies; fails open if the agent bypasses the gateway | Fails closed at the syscall layer; agent cannot proceed |

The two layers compose. Cedar can deny a `vault::secret::read` for `incident-collector`; if the agent then tries to `execve("/usr/bin/vault")` to bypass the MCP boundary, prempti can refuse the `execve` because that process tree is not on the kernel-side allowlist. The signed-receipt chain captures both events as evidence.

### 3.3 What prempti does *not* solve

- **In-process prompt injection.** If the agent legitimately has MCP access to `vault::secret::read` and Cedar allows it, prempti will also allow the corresponding userspace path. The semantic bug — "I should not have run this because the prompt was malicious" — is a Cedar and prompt-defense problem, not a kernel one.
- **Cross-tenant data leakage inside an allowed tool call.** If `grafana::query` is allowed and the agent reads a dashboard it should not have, prempti has nothing to say. That is what Cedar resource scoping is for.
- **Non-Linux hosts.** macOS dev laptops, Windows hosts, container runtimes on platforms without eBPF/LSM support do not get the prempti boundary. The recommendation in this evaluation is explicit about the Linux-only scope.
- **The first time an attacker uses a kernel exploit to break out of prempti's enforcement.** prempti is a strong boundary, not an infinite one. It raises the cost; it does not eliminate the threat.

## 4. Three plausible relationships

### Option A — Optional add-on (recommended companion)

opsbench documents prempti as a recommended companion in `docs/integrations.md`, ships a small recipe at `tools/prempti-bundle/` containing example Falco-style rules derived from `tools.cedar`, and otherwise treats prempti as a third-party dependency that operators install themselves. The opsbench installer does not detect prempti, does not configure it, and does not change behaviour based on whether it is running.

**Pros.** Lowest implementation cost; no installer scope; ships immediately as a docs change. Honours the principle "vendor MCPs > custom code" (apply the same principle to security primitives: vendor enforcement > our enforcement). Works on every Linux distro because the recipe is just "go read upstream and run their installer." Does not change opsbench's primary user (the Pi-or-Claude-Code operator) experience at all.

**Cons.** Adoption rate will be near zero. Operators who do not already know prempti will skim the doc, see "optional," and move on. The defense-in-depth property only exists for the small population that already runs Falco; opsbench gets no credit for the integration, and incident-response evidence does not pick up the kernel-side denies. We also miss the chance to *generate* prempti policies from the same Cedar source-of-truth, which is the single biggest authoring win we could ship.

### Option B — Opt-in default on Linux (recommended)

The opsbench installer, when run on a Linux host (`uname -s == Linux`), offers a `--with-prempti` flag. With the flag, the installer additionally:

- Detects whether prempti's userspace daemon is already running. If yes, configures it; if no, downloads the upstream binary into `~/.local/share/opsbench/prempti/` and registers a systemd user unit (or an OpenRC/runit equivalent on non-systemd distros).
- Generates a starter Falco-style rules file `~/.config/opsbench/prempti/rules.yaml` from the same recipe `tools:` blocks that F1's `generate-cedar-policy.sh` reads.
- Wires the gateway's `gateway.yaml#custody.kernel_enforcement` block to point at prempti's audit socket so kernel-side denies enrich the F3 receipt with a `kernel_enforcement` evidence section.
- Adds a `--with-prempti` line to the post-install summary so the operator knows kernel enforcement is on.

Without the flag, the installer behaves exactly as it does today; no prempti, no kernel enforcement, no perf overhead. Devbox use is unchanged.

**Pros.** Real adoption: serious deployments (on-prem clusters, dedicated incident-response hosts, production agent fleets) get one CLI flag away from kernel-layer enforcement. Policy is generated from the same Cedar source, so we do not double the operator's authoring burden. Receipts gain a verifiable kernel-enforcement section without F3's schema growing the userspace-vs-kernel distinction into something complicated. Devbox / laptop users are unaffected. Pi-first posture is preserved because Pi-on-Linux-host benefits from prempti automatically when an operator opts in; Pi-on-macOS keeps working without it. We also keep an honest opt-out for the "we trust our agents, we hate kernel modules" crowd.

**Cons.** Implementation cost is non-trivial: installer flag wiring, rule-generator, gateway plumbing, receipt schema enrichment, CI coverage on a Linux runner with prempti available. We accept a non-zero risk that prempti's project evolution breaks the generated-rules contract; mitigated by pinning a known-working release tag in the installer.

### Option C — Always-on Linux requirement

On Linux, opsbench refuses to start without prempti running. Installer aborts if prempti is not detected; gateway refuses to bind unless its audit socket is talking to prempti.

**Pros.** Strongest possible guarantee: kernel-layer enforcement is non-negotiable. Defense-in-depth becomes a property of "opsbench on Linux," full stop.

**Cons.** Breaks devbox use entirely. A developer running opsbench inside a Linux dev container, inside WSL, inside a Linux VM on macOS, inside a CI runner without privileged mode, would all be blocked. The Pi-first posture (parent roadmap § "Cross-cutting principles") is fundamentally laptop-friendly; this option fights that. Also assumes prempti is appropriate for every Linux deployment, which is not knowable in advance — short-lived ephemeral runners, GitHub Actions self-hosted, locked-down kiosk-style boxes may not allow prempti's privileged daemon. Finally, we would be coupling opsbench's release cadence to prempti's, which is too much shared fate for a project we do not control.

## 5. Recommended relationship — Option B

**Recommendation: ship prempti integration as the `--with-prempti` opt-in default on Linux.**

The decisive criteria:

- **Enforcement-strength gain is real.** A compromised agent that bypasses the gateway *is* bounded by prempti. That is the property the catalog flagged and it is the property the F-series roadmap wants from its security layer.
- **Dev-UX cost stays at zero by default.** The flag is opt-in. Pi-on-laptop users, Claude Code-on-macOS users, anyone running opsbench in a dev container without privileged mode, all keep working exactly as they do today. We do not turn a dev tool into something that needs `sudo` to install.
- **Policy-authoring overhead is bounded by Cedar.** Operators do not learn a second policy DSL; the prempti rules are *generated* from the same recipe `tools:` blocks that F1's Cedar generator already reads. The hand-edited override surface is small (`~/.config/opsbench/prempti/rules.local.yaml` mirrors the `tools.cedar` override pattern).
- **Evidence integrates with F3 cleanly.** A `kernel_enforcement` block is additive on top of the receipt schema. Receipts with the block are strictly more useful for an auditor; receipts without it (Pi-on-mac, devbox) are unchanged.
- **Vendor-MCPs-style framing applies.** opsbench does not build its own kernel enforcement; we adopt the upstream that Falcosecurity ships and is publicly maintained. We add the policy-generation glue and the evidence integration, which is the thin layer that justifies the package.
- **Honest opt-out remains.** The flag is opt-in, not opt-out. Operators who decline lose the kernel layer but keep everything else. That is the right trade-off for a project whose audience runs the gamut from "personal Pi on a laptop" to "fleet of incident-response hosts in a regulated cluster."

Option A is too weak (no adoption); Option C is too strong (breaks the laptop story). Option B is the right enforcement-vs-dev-UX trade-off.

## 6. If Option B — concrete integration points

### 6.1 Installer surface

- New flag: `scripts/install.sh --with-prempti`.
- Linux-only detection: `case "$(uname -s)" in Linux) PREMPTI_AVAILABLE=1 ;; esac`.
- On non-Linux hosts with the flag set: print a warning, ignore the flag, continue.
- When `--with-prempti` is set on Linux:
  - Run `scripts/install-prempti.sh` as a new sub-stage after the existing F3 key-bootstrap stage.
  - The sub-stage downloads the pinned prempti binary tag (see § 6.4), verifies its SHA-256 against `scripts/prempti.sha256` (committed in repo), installs to `~/.local/share/opsbench/prempti/bin/prempti`.
  - Generates an initial rules file via `scripts/generate-prempti-rules.sh` (described in § 6.2) and writes it to `~/.config/opsbench/prempti/rules.yaml`.
  - Registers a user-level systemd unit (or OpenRC/runit equivalent) at `~/.config/systemd/user/opsbench-prempti.service`. The unit runs prempti as the invoking user — no root requirement for the gateway-side wiring, though prempti itself may require `CAP_SYS_ADMIN` to attach eBPF programs; the installer surfaces this clearly and offers a `sudo` step the operator must approve.
  - Prints a post-install summary line: `kernel_enforcement: prempti pinned to <version>; rules at ~/.config/opsbench/prempti/rules.yaml; status: <active|pending-sudo>`.
- Without the flag: installer skips the whole sub-stage. No prempti binary, no rules file, no service. The gateway runs exactly as it does in F3.

### 6.2 Rule generation from `tools.cedar`

New script `scripts/generate-prempti-rules.sh`:

- Inputs: the same recipe directory the F1 Cedar generator reads, plus the agent role manifests.
- For each recipe's `tools:` block, the script maps each declared MCP tool to a prempti rule expressing the kernel-side enforcement equivalent. The mapping is well-defined for the common shapes: tools that talk to a local CLI translate to an `execve` allowlist on that binary's path; tools that talk to a remote service translate to a `connect` allowlist on that endpoint's hostname/IP; tools that read files translate to a `openat` allowlist on the path pattern.
- The output file is at `~/.config/opsbench/prempti/rules.yaml` and is **generated, not hand-edited**. The hand-edit surface is `~/.config/opsbench/prempti/rules.local.yaml`, which is merged on top with last-writer-wins semantics.
- The script is idempotent. Re-running it overwrites the generated rules file but never touches `rules.local.yaml`.
- The script runs in CI under a new job (`validate-prempti-rules`) that asserts the generated YAML parses cleanly and lints against an upstream-provided schema if one is available; otherwise against a structural schema we maintain in `schemas/prempti-rules.v1.json`.

### 6.3 Gateway plumbing — `gateway.yaml#custody.kernel_enforcement`

New optional block in the gateway configuration:

```yaml
custody:
  schema_version: "v2"
  kernel_enforcement:
    enabled: true
    backend: "prempti"
    audit_socket: "/run/user/${UID}/prempti/audit.sock"
    poll_interval: "100ms"
    fail_mode: "log"        # one of: log | block
```

The gateway opens the audit socket at startup; when an MCP tool call is in flight, the gateway records the call's `args_sha256` and the resolved tool target (CLI binary path, hostname, or file pattern). After the call completes, the gateway queries the prempti audit socket for any allow/deny events that match the call's process tree and time window, and attaches the result to the receipt as a `kernel_enforcement` block.

`fail_mode: "log"` means the gateway emits a custody-log warning if the audit socket is unreachable but still completes the call (the userspace Cedar layer remains authoritative). `fail_mode: "block"` means the gateway refuses to forward the call if the audit socket is unreachable — the strict posture, recommended for production-incident hosts.

### 6.4 Receipt schema enrichment — `kernel_enforcement` block

The F3 receipt schema (see [`./2026-06-04-f3-design.md`](./2026-06-04-f3-design.md) § 3.1, `packages/team-incident-response/schemas/receipt.v1.json`) gains an optional `kernel_enforcement` property. The schema bump is additive — receipts without the block are still valid v2 receipts; receipts with the block are strictly more informative. No `schema_version` increment is required because the field is not in `required`. This matches the F3 forward-extension contract (F3 spec § 3.11).

The new property:

```jsonc
{
  "kernel_enforcement": {
    "type": ["object", "null"],
    "additionalProperties": false,
    "description": "F6 — prempti kernel-side enforcement evidence, present when gateway.yaml#custody.kernel_enforcement.enabled is true.",
    "required": ["backend", "decision", "evaluated_at"],
    "properties": {
      "backend":      { "const": "prempti" },
      "version":      { "type": "string" },
      "rules_sha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
      "decision":     { "enum": ["allow", "deny", "no-match", "audit-unreachable"] },
      "evaluated_at": { "type": "string", "format": "date-time" },
      "syscall":      { "type": "string", "description": "e.g. execve, connect, openat" },
      "target":       { "type": "string", "description": "path/host/fd target as captured by prempti" },
      "cgroup":       { "type": "string" },
      "deny_reason":  { "type": ["string", "null"] }
    }
  }
}
```

The block is signed identically to the rest of the canonical payload (F3 § 3.2 still applies — the block is part of the canonicalised receipt). The Bash and Go verifiers do not need new code; they treat the block as opaque additional fields.

The `custody.log` enrichment is best-effort and never blocks the gateway's main path. If the prempti audit socket is unreachable and `fail_mode: "log"` is set, the receipt is emitted with `kernel_enforcement.decision: "audit-unreachable"` — the receipt is still valid and verifiable; the operator sees that kernel enforcement was non-authoritative for that call.

### 6.5 Cross-link with F3

The F3 spec's § 3.10 directory layout grows by one CLI helper and one schema reference but no new core file. The PR shape from F3 § 5.12 acquires a fifth conceptual PR (in F6, not F3): `feat/f6-prempti-bundle` lands the installer flag, the rule generator, the gateway plumbing, the schema field, and the CI job. The F3 schema is edited in place to add the optional `kernel_enforcement` property — additive, no version bump, consistent with F3 § 3.11.

The F3 verifier semantics (F3 spec § 3.7) gain one paragraph in the verifier's README explaining the `kernel_enforcement` field, but the verifier itself is unchanged because the field is part of the signed canonical payload and verifies for free.

The key-rotation runbook (F3 § 3) gains an addendum: when rotating the gateway's signing key, the prempti rules-generator does not need to regenerate — the kernel enforcement layer is keyless. Only the receipt-signing surface rotates.

### 6.6 Pi-first posture

Pi runs on Linux. Pi-on-Linux therefore picks up prempti automatically under `--with-prempti`. Pi on a non-Linux host (macOS-dev laptop, occasionally) keeps working without prempti — the integration is opt-in, the receipt simply has no `kernel_enforcement` block, the gateway behaves identically to its F3 state.

The Pi `AGENTS.md` snippet in each F2-rewritten recipe (F3 § 3.13) gains a one-line note when prempti is detected at install time: "kernel enforcement: prempti active; see `~/.config/opsbench/prempti/rules.yaml` for the active policy."

### 6.7 Recipe-author surface — minimal new burden

Recipe authors do not write prempti rules by hand. The `tools:` frontmatter block introduced in F1 is extended with two optional shapes — `cli_binary:` and `network_target:` — that the prempti rule generator consumes. Recipes that already declare these because they are sane MCP recipes (most of the F0 bulk-ship recipes already know which CLI binary the MCP wraps) get prempti coverage for free. Recipes that do not declare them get a non-fatal warning from `generate-prempti-rules.sh` and a wider permissive rule until a maintainer fills in the block.

This keeps the recipe-author cognitive load at "I already needed to declare this for Cedar to make sense." It does not introduce a parallel security DSL.

### 6.8 Failure modes and degradation

- **prempti daemon dies.** The gateway's audit-socket reader emits a warning, future receipts carry `kernel_enforcement.decision: "audit-unreachable"`, and operations continue (in `fail_mode: "log"`) or fail closed (in `fail_mode: "block"`). The systemd unit restarts prempti on its standard backoff schedule.
- **Rules file is malformed.** prempti refuses to start with the new rules and continues running the old (in-memory) rules. The installer's CI job catches this in pre-merge.
- **Pinned prempti version drifts from current.** The installer pins a known-working tag in `scripts/prempti.sha256`. Operators who want a newer version can override via `OPSBENCH_PREMPTI_VERSION=...`. The F3 receipts capture the prempti version in the `kernel_enforcement.version` field so operators can correlate audit changes with version changes.
- **Operator declines `sudo` for the kernel-attach step.** prempti exits gracefully; the installer prints a clear remediation note; the gateway runs in F3 mode without the `kernel_enforcement` block. The operator can re-enable later by re-running with `--with-prempti`.

## 7. Open questions

1. **Does prempti compose with sympozium's gVisor/Kata sandbox layer?** Sympozium (separately evaluated in F6) deploys agents inside Kubernetes pods that may be backed by gVisor or Kata Containers. Both runtime layers intercept syscalls themselves; whether prempti's eBPF-attached enforcement still sees those calls — and with sufficient context to produce useful audit events — is not knowable from the documentation alone. The right resolution is a one-day integration spike with a sympozium-deployed gVisor pod and a prempti policy, measuring whether the kernel-enforcement decisions show up in the receipts. If they do not, opsbench documents prempti as "compatible with bare-metal and native-container Linux only" and recommends Cedar-only enforcement inside sandboxed runtimes (which are themselves a form of kernel enforcement).
2. **What is the realistic performance overhead on a busy gateway host?** prempti's per-syscall check is sub-microsecond at the kernel level, but the gateway's audit-socket poll (§ 6.3) introduces userspace overhead per call. The F3 budget is <100ms p95 round-trip; the receipt-enrichment step needs to fit inside that without consuming a meaningful fraction. The right measurement is a gateway-integration CI job (parallel to F3's `gateway-integration.yml`) that runs a 1000-call workload through the gateway with and without `--with-prempti` and asserts the p95 delta is under 5ms. If it is over, the audit-socket poll moves to an async channel and the receipt's `kernel_enforcement` block becomes a "may arrive later" enrichment rather than a synchronous one.
3. **What is the right Falco-vs-prempti delineation for operators who already run Falco?** Many production clusters already run Falco for observability-only kernel monitoring. prempti shares heritage with Falco but enforces rather than observes. Operators with an existing Falco install will want to know whether prempti coexists or supersedes their existing setup. The current Falcosecurity documentation suggests coexistence, but the right resolution is a docs-only follow-up in F6: a small integration page at `docs/integrations.md#falco-coexistence` that describes the two daemons running side-by-side, sharing eBPF program slots where possible, and pointing at upstream guidance for any conflicts. No code change; just an honest note for operators who care.
