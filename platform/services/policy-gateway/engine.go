// Package policygateway is C1 — the default-deny Policy Decision Point (PDP).
//
// Every tool call (read and write) is evaluated here, outside the model's reasoning
// loop (PRD GOV-002). The engine is Cedar (via cedar-go, pure Go — single static
// binary, no cgo/WASM). Per spec amendment A1 the enforcement path is "preparse +
// per-call entity slice": the policy set is parsed ONCE at construction, and each
// decision builds only the entities that request needs (principal + team parents,
// resource + its attributes), which cedar-go authorizes directly.
//
// Domain model (mirrors the S1 spike reference set):
//
//	Principal : Agent   — a workload, member of one or more Team groups
//	Action    : Action::"invoke" (per-call) | Action::"list" (tool-list filtering)
//	Resource  : Tool    — tagged with env, danger, read_only, owner_team
//
// Default is deny; a Cedar forbid always overrides a permit.
package policygateway

import (
	"fmt"

	cedar "github.com/cedar-policy/cedar-go"
	"github.com/cedar-policy/cedar-go/types"
)

// EngineKind is the policy-engine kind recorded on every PolicyDecisionRecord.
const EngineKind = "cedar"

const cedarGoVersion = "cedar-go@v1.8.0"

const (
	principalType types.EntityType = "Agent"
	teamType      types.EntityType = "Team"
	actionType    types.EntityType = "Action"
)

const defaultResourceType = "Tool"

// Decision is C1's verdict. Effect is "permit" or "deny". Tier is the base approval
// tier (0 auto · 1 notify · 2 single · 3 two-person); GOV-003's no-dry-run
// auto-escalation is applied downstream by C2, not here.
type Decision struct {
	Effect           string
	Tier             int
	PolicyRefs       []string
	DecisionRecordID string // set by Service.Authorize once the PDR is durably recorded
}

// Request is one authorization query. The engine builds the minimal Cedar entity
// slice from it — the preparse + per-call-slice path made normative by amendment A1.
type Request struct {
	Principal       string         // agent id → Agent::"<principal>"
	PrincipalTeams  []string       // team memberships → Agent parents (Team::"<t>")
	Action          string         // Action::"<action>", e.g. "invoke" | "list"
	Resource        string         // resource id
	ResourceType    string         // Cedar entity type for the resource (default "Tool")
	ResourceParents []string       // owning teams → resource parents (Team::"<t>")
	ResourceAttrs   map[string]any // env, danger, read_only, owner_team, ...
	Context         map[string]any // freeze state, human_approval, autonomy level, ...
}

// CedarEngine is a cedar-go PDP. The policy set is parsed once at construction
// (preparse); each Decide builds only the entities the request needs.
type CedarEngine struct {
	ps      *cedar.PolicySet
	version string
}

// NewCedarEngine parses a Cedar policy document once (preparse). The parsed set is
// reused for every subsequent Decide — no re-parse on the hot path (A1).
func NewCedarEngine(policySrc []byte) (*CedarEngine, error) {
	ps, err := cedar.NewPolicySetFromBytes("policy.cedar", policySrc)
	if err != nil {
		return nil, fmt.Errorf("policygateway: parse policy set: %w", err)
	}
	return &CedarEngine{ps: ps, version: cedarGoVersion}, nil
}

// Version reports the policy-engine version (recorded on PolicyDecisionRecords).
func (e *CedarEngine) Version() string { return e.version }

// Decide authorizes the request against the preparsed policy set. Default is deny;
// a forbid always overrides a permit (Cedar semantics). Evaluation is deterministic:
// identical requests yield identical decisions (GOV-002).
func (e *CedarEngine) Decide(r Request) Decision {
	entities := types.EntityMap{}

	// principal (Agent) + its team parents
	pUID := cedar.NewEntityUID(principalType, types.String(r.Principal))
	pParents := teamUIDs(r.PrincipalTeams)
	entities[pUID] = types.Entity{
		UID:        pUID,
		Parents:    cedar.NewEntityUIDSet(pParents...),
		Attributes: types.NewRecord(nil),
	}

	// resource + its attributes + owning-team parents
	rType := types.EntityType(r.ResourceType)
	if r.ResourceType == "" {
		rType = defaultResourceType
	}
	rUID := cedar.NewEntityUID(rType, types.String(r.Resource))
	rParents := teamUIDs(r.ResourceParents)
	entities[rUID] = types.Entity{
		UID:        rUID,
		Parents:    cedar.NewEntityUIDSet(rParents...),
		Attributes: recordFrom(r.ResourceAttrs),
	}

	// referenced teams as bare entities (membership targets)
	for _, tu := range pParents {
		addBareEntity(entities, tu)
	}
	for _, tu := range rParents {
		addBareEntity(entities, tu)
	}

	req := types.Request{
		Principal: pUID,
		Action:    cedar.NewEntityUID(actionType, types.String(r.Action)),
		Resource:  rUID,
		Context:   recordFrom(r.Context),
	}

	decision, diag := e.ps.IsAuthorized(entities, req)

	effect := "deny"
	if decision == cedar.Allow {
		effect = "permit"
	}
	refs := make([]string, 0, len(diag.Reasons))
	for _, reason := range diag.Reasons {
		refs = append(refs, string(reason.PolicyID))
	}
	return Decision{Effect: effect, Tier: baseTier(effect, r), PolicyRefs: refs}
}

func addBareEntity(m types.EntityMap, uid types.EntityUID) {
	if _, ok := m[uid]; !ok {
		m[uid] = types.Entity{UID: uid, Parents: cedar.NewEntityUIDSet(), Attributes: types.NewRecord(nil)}
	}
}

func teamUIDs(teams []string) []types.EntityUID {
	uids := make([]types.EntityUID, 0, len(teams))
	for _, t := range teams {
		uids = append(uids, cedar.NewEntityUID(teamType, types.String(t)))
	}
	return uids
}

// baseTier is C1's provisional tier. Slice 3 replaces this heuristic with tier
// derivation from policy annotations.
func baseTier(effect string, r Request) int {
	if effect != "permit" {
		return 0
	}
	if b, ok := r.ResourceAttrs["danger"].(bool); ok && b {
		return 3
	}
	if env, ok := r.ResourceAttrs["env"].(string); ok && env == "prod" {
		return 2
	}
	return 0
}

func recordFrom(m map[string]any) types.Record {
	if len(m) == 0 {
		return types.NewRecord(nil)
	}
	rm := types.RecordMap{}
	for k, v := range m {
		if val, ok := toValue(v); ok {
			rm[types.String(k)] = val
		}
	}
	return types.NewRecord(rm)
}

func toValue(v any) (types.Value, bool) {
	switch x := v.(type) {
	case string:
		return types.String(x), true
	case bool:
		return types.Boolean(x), true
	case int:
		return types.Long(int64(x)), true
	case int64:
		return types.Long(x), true
	case float64:
		return types.Long(int64(x)), true
	case map[string]any:
		return recordFrom(x), true
	default:
		return nil, false
	}
}
