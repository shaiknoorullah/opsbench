// validate.mjs — authoritative Cedar gate for team-incident-response.
//
// Run by CI and lefthook (and `npm test`). Uses the real Cedar engine (@cedar-policy/cedar-wasm)
// to (1) parse the schema, (2) strict-validate tools.cedar + governors.cedar against it, and
// (3) assert a battery of allow/deny decisions. Exits non-zero on any failure, so a typo in an
// action name, a reference to an undeclared attribute, or a regressed decision fails the build.
//
// This replaces the previous `cedar validate ... || true` no-op. The hook (pre-tool-use.sh)
// builds requests in exactly the shape exercised here.
import * as cedar from "@cedar-policy/cedar-wasm/nodejs";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const schema = readFileSync(here("./opsbench.cedarschema"), "utf8");
const tools = readFileSync(here("./tools.cedar"), "utf8");
const governors = readFileSync(here("../governors.cedar"), "utf8");

let fail = 0;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const grn = (s) => `\x1b[32m${s}\x1b[0m`;
console.log("cedar engine", cedar.getCedarVersion());

// 1. schema parses
const sp = cedar.checkParseSchema(schema);
if (sp.type !== "success") { fail++; console.log(red("SCHEMA PARSE FAIL"), JSON.stringify(sp.errors, null, 2)); }
else console.log(grn("✓ schema parses"));

// 2. strict-validate both policy files
for (const [name, policies] of [["tools.cedar", tools], ["governors.cedar", governors]]) {
  const v = cedar.validate({ schema, policies: { staticPolicies: policies }, validationSettings: { mode: "strict" } });
  if (v.type !== "success") { fail++; console.log(red(`VALIDATE ${name}: parse failure`), JSON.stringify(v.errors, null, 2)); continue; }
  if (v.validationErrors.length) {
    fail++; console.log(red(`VALIDATE ${name}: ${v.validationErrors.length} error(s)`));
    for (const e of v.validationErrors) console.log("   ", e.policyId, "—", e.error.message);
  } else console.log(grn(`✓ validate ${name}`) + (v.validationWarnings.length ? ` (${v.validationWarnings.length} warning(s))` : ""));
}

// 3. decision battery
function decide(policies, { principal, action, resource, context = {} }) {
  const resObj = typeof resource === "string" ? { id: resource } : resource;
  const uid = { type: resObj.type || "Resource", id: resObj.id };
  const entities = [
    { uid: { type: "Agent", id: principal }, attrs: {}, parents: [] },
    { uid, attrs: resObj.attrs || {}, parents: [] },
  ];
  const ans = cedar.isAuthorized({
    principal: { type: "Agent", id: principal }, action: { type: "Action", id: action },
    resource: uid, context, policies: { staticPolicies: policies }, entities,
  });
  if (ans.type !== "success") return { error: ans.errors };
  return { decision: ans.response.decision };
}
function expect(policies, label, req, want) {
  const r = decide(policies, req);
  if (r.error) { fail++; console.log(red(`ERR  ${label}`), JSON.stringify(r.error)); return; }
  const ok = r.decision === want;
  if (!ok) fail++;
  console.log(`${ok ? grn("✓") : red("✗")} [${r.decision}] ${label}${ok ? "" : red(` (expected ${want})`)}`);
}
const T = (l, req, want) => expect(tools, l, req, want);
const G = (l, req, want) => expect(governors, l, req, want);
const dt = (s) => ({ __extn: { fn: "datetime", arg: s } });

console.log("\ntools.cedar decisions:");
T("commander reads", { principal: "incident-commander", action: "FS::read", resource: { id: "/x", attrs: { path: "/x" } } }, "allow");
T("commander cannot scale", { principal: "incident-commander", action: "k8s::scale", resource: "d" }, "deny");
T("timeline-keeper appends timeline", { principal: "timeline-keeper", action: "FS::append", resource: { id: "p", attrs: { path: "/i/INC-1/timeline.md" } } }, "allow");
T("timeline-keeper cannot overwrite timeline", { principal: "timeline-keeper", action: "FS::write", resource: { id: "p", attrs: { path: "/i/INC-1/timeline.md" } } }, "deny");
T("quarantine scale WITH approval", { principal: "quarantine-coordinator", action: "k8s::scale", resource: "d", context: { human_approval: true } }, "allow");
T("quarantine scale WITHOUT approval", { principal: "quarantine-coordinator", action: "k8s::scale", resource: "d" }, "deny");
T("collector gets pods", { principal: "controlplane-collector", action: "k8s::get", resource: "p" }, "allow");
T("collector cannot delete", { principal: "controlplane-collector", action: "k8s::delete", resource: "p" }, "deny");
T("node ssh journalctl", { principal: "node-collector", action: "Bash::ssh::readonly", resource: { id: "n", attrs: { command_class: "journalctl" } } }, "allow");
T("node ssh rm class denied", { principal: "node-collector", action: "Bash::ssh::readonly", resource: { id: "n", attrs: { command_class: "rm" } } }, "deny");
T("collector writes evidence", { principal: "storage-collector", action: "FS::write", resource: { id: "p", attrs: { path: "/i/round-1/evidence/x" } } }, "allow");
T("witness pushes to witness repo", { principal: "evidence-witness", action: "git::push", resource: { id: "r", attrs: { repo: "incident-witness" } } }, "allow");
T("witness cannot push elsewhere", { principal: "evidence-witness", action: "git::push", resource: { id: "r", attrs: { repo: "app" } } }, "deny");
T("hypothesis reads evidence", { principal: "hypothesis-storage", action: "FS::read", resource: { id: "p", attrs: { path: "/i/round-1/evidence/x" } } }, "allow");
T("hypothesis writes its verdict", { principal: "hypothesis-storage", action: "FS::write", resource: { id: "p", attrs: { path: "/i/round-1/hypotheses/s.md" } } }, "allow");
T("hypothesis CANNOT write evidence", { principal: "hypothesis-storage", action: "FS::write", resource: { id: "p", attrs: { path: "/i/round-1/evidence/x" } } }, "deny");
T("hypothesis CANNOT touch cluster", { principal: "hypothesis-storage", action: "k8s::get", resource: "p" }, "deny");
T("synthesizer writes verdict", { principal: "forensic-synthesizer", action: "FS::write", resource: { id: "p", attrs: { path: "/i/round-1/verdict.md" } } }, "allow");
T("synthesizer CANNOT write evidence", { principal: "forensic-synthesizer", action: "FS::write", resource: { id: "p", attrs: { path: "/i/round-1/evidence/x" } } }, "deny");
T("rca-author final WITH confirmed", { principal: "rca-author", action: "FS::write", resource: { id: "p", attrs: { path: "/i/final/rca.md" } }, context: { verdict_status: "ROOT_CAUSE_CONFIRMED" } }, "allow");
T("rca-author final WITHOUT confirmed", { principal: "rca-author", action: "FS::write", resource: { id: "p", attrs: { path: "/i/final/rca.md" } }, context: { verdict_status: "NEED_MORE_EVIDENCE" } }, "deny");
T("comms-author writes draft", { principal: "customer-comms-author", action: "FS::write", resource: { id: "p", attrs: { path: "/i/comms/draft-1.md" } } }, "allow");
T("comms-author cannot post slack", { principal: "customer-comms-author", action: "slack::post", resource: "c" }, "deny");
T("recovery-planner cannot scale", { principal: "recovery-planner", action: "k8s::scale", resource: "d" }, "deny");
T("recovery-executor scale (confirmed+approval+step)", { principal: "recovery-executor", action: "k8s::scale", resource: "d", context: { human_approval: true, verdict_status: "ROOT_CAUSE_CONFIRMED", recovery_step_id: "S1" } }, "allow");
T("recovery-executor scale denied w/o confirmed", { principal: "recovery-executor", action: "k8s::scale", resource: "d", context: { human_approval: true, recovery_step_id: "S1" } }, "deny");
T("recovery-executor delete denied (non-destructive risk)", { principal: "recovery-executor", action: "k8s::delete", resource: "d", context: { human_approval: true, verdict_status: "ROOT_CAUSE_CONFIRMED", recovery_step_id: "S1" } }, "deny");
T("recovery-executor delete allowed (destructive approval)", { principal: "recovery-executor", action: "k8s::delete", resource: "d", context: { human_approval: true, verdict_status: "ROOT_CAUSE_CONFIRMED", recovery_step_id: "S1", recovery_step_risk: "destructive" } }, "allow");
T("verdict-arbiter reads", { principal: "verdict-arbiter", action: "FS::read", resource: { id: "p", attrs: { path: "/i/round-1/verdict.md" } } }, "allow");
T("verdict-arbiter writes arbiter-decision", { principal: "verdict-arbiter", action: "FS::write", resource: { id: "p", attrs: { path: "/i/round-1/arbiter-decision.json" } } }, "allow");
T("verdict-arbiter cannot write verdict.md", { principal: "verdict-arbiter", action: "FS::write", resource: { id: "p", attrs: { path: "/i/round-1/verdict.md" } } }, "deny");
T("human-escalation pages pagerduty", { principal: "human-escalation", action: "pagerduty::trigger", resource: "p" }, "allow");
T("self-protection: cannot edit a cedar policy", { principal: "recovery-executor", action: "FS::write", resource: { id: "p", attrs: { path: "/x/policies/cedar/tools.cedar" } }, context: { human_approval: true, verdict_status: "ROOT_CAUSE_CONFIRMED", recovery_step_id: "S1" } }, "deny");
T("self-protection: cannot edit a hook", { principal: "incident-commander", action: "FS::write", resource: { id: "p", attrs: { path: "/x/hooks/pre-tool-use.sh" } } }, "deny");
T("human-operator can do anything", { principal: "human-operator", action: "k8s::delete", resource: "x" }, "allow");
T("unknown agent denied by default", { principal: "nobody", action: "FS::read", resource: { id: "p", attrs: { path: "/x" } } }, "deny");
T("unclassified mcp denied (deny sink)", { principal: "incident-commander", action: "mcp::unknown", resource: "x" }, "deny");

console.log("\ngovernors.cedar decisions:");
G("new_round under cap", { principal: "incident-commander", action: "loop::new_round", resource: { type: "Incident", id: "I" }, context: { rounds_used: 1, requesting_round: 2 } }, "allow");
G("new_round at hard cap", { principal: "incident-commander", action: "loop::new_round", resource: { type: "Incident", id: "I" }, context: { rounds_used: 5 } }, "deny");
G("dispatch over wall-clock", { principal: "evidence-requester", action: "loop::dispatch_collection", resource: { type: "Incident", id: "I" }, context: { wall_clock_used_min: 1500, requesting_round: 2, human_approval_recorded: true, falsification_artifacts_requested: 1, artifact_count_requested: 5 } }, "deny");
G("dispatch round3 over budget", { principal: "evidence-requester", action: "loop::dispatch_collection", resource: { type: "Incident", id: "I" }, context: { requesting_round: 3, artifact_count_requested: 40, human_approval_recorded: true, falsification_artifacts_requested: 2 } }, "deny");
G("dispatch round2 missing approval", { principal: "evidence-requester", action: "loop::dispatch_collection", resource: { type: "Incident", id: "I" }, context: { requesting_round: 2, artifact_count_requested: 5, falsification_artifacts_requested: 1 } }, "deny");
G("dispatch stale request", { principal: "evidence-requester", action: "loop::dispatch_collection", resource: { type: "Incident", id: "I" }, context: { requesting_round: 2, artifact_count_requested: 5, falsification_artifacts_requested: 1, human_approval_recorded: true, now_utc: dt("2026-06-26T12:00:00Z"), staleness_deadline_utc: dt("2026-06-26T06:00:00Z") } }, "deny");
G("recovery::execute denied w/o confirmed", { principal: "recovery-executor", action: "recovery::execute", resource: { type: "Incident", id: "I" }, context: { verdict_status: "NEED_MORE_EVIDENCE" } }, "deny");
G("recovery::execute allowed w/ confirmed", { principal: "recovery-executor", action: "recovery::execute", resource: { type: "Incident", id: "I" }, context: { verdict_status: "ROOT_CAUSE_CONFIRMED" } }, "allow");
G("author_final clean", { principal: "rca-author", action: "loop::author_final", resource: { type: "Incident", id: "I" }, context: { verdict_status: "ROOT_CAUSE_CONFIRMED", tone_review_passed: true, citation_check_passed: true, schema_validation_passed: true } }, "allow");
G("author_final blocked if reviews unclean", { principal: "rca-author", action: "loop::author_final", resource: { type: "Incident", id: "I" }, context: { verdict_status: "ROOT_CAUSE_CONFIRMED", tone_review_passed: false } }, "deny");

console.log(`\n${fail === 0 ? grn("CEDAR GATE: ALL CHECKS PASSED") : red(`CEDAR GATE: ${fail} CHECK(S) FAILED`)}`);
process.exit(fail === 0 ? 0 : 1);
