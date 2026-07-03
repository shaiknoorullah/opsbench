package policygateway

import (
	"context"
	"errors"
	"regexp"
	"testing"
)

var pdrIDRe = regexp.MustCompile(`^pdr_[0-9A-HJKMNP-TV-Z]{26}$`)

func permitReq() Request {
	return Request{
		Principal: "a1", PrincipalTeams: []string{"team-a"}, Action: "invoke",
		Resource: "tool1", ResourceParents: []string{"team-a"},
		ResourceAttrs: map[string]any{"env": "staging", "danger": false, "read_only": true},
		Context:       map[string]any{"human_approval": false, "verdict": "none"},
	}
}

func TestAuthorizeRecordsDecision(t *testing.T) {
	rec := &MemoryRecorder{}
	svc := NewService(newTestEngine(t), rec, "t_acme")

	d, err := svc.Authorize(context.Background(), permitReq(), PhaseInvocation)
	if err != nil {
		t.Fatalf("Authorize: %v", err)
	}
	if d.Effect != "permit" {
		t.Fatalf("effect = %q, want permit", d.Effect)
	}
	if len(rec.Records) != 1 {
		t.Fatalf("recorded %d records, want 1", len(rec.Records))
	}
	got := rec.Records[0]
	if !pdrIDRe.MatchString(got.ID) {
		t.Errorf("record id %q does not match pdr_<ULID> pattern", got.ID)
	}
	if d.DecisionRecordID != got.ID {
		t.Errorf("decision id %q != recorded id %q", d.DecisionRecordID, got.ID)
	}
	if got.Effect != "permit" || got.Engine.Kind != "cedar" || got.Phase != PhaseInvocation {
		t.Errorf("bad record: effect=%q engine=%q phase=%q", got.Effect, got.Engine.Kind, got.Phase)
	}
	if got.TenantID != "t_acme" {
		t.Errorf("tenant = %q, want t_acme", got.TenantID)
	}
	if len(got.PolicyRefs) == 0 {
		t.Errorf("permit record should cite policy refs")
	}
	if len(got.ContextHash) != 64 {
		t.Errorf("context_hash = %q (len %d), want 64 hex chars", got.ContextHash, len(got.ContextHash))
	}
	if got.Engine.Version == "" {
		t.Errorf("engine version should be set")
	}
}

func TestContextHashReproducibleAndSensitive(t *testing.T) {
	rec := &MemoryRecorder{}
	svc := NewService(newTestEngine(t), rec, "t_acme")

	// same context twice → identical hash + effect (GOV-002 reproducibility)
	_, _ = svc.Authorize(context.Background(), permitReq(), PhaseInvocation)
	_, _ = svc.Authorize(context.Background(), permitReq(), PhaseInvocation)
	if rec.Records[0].ContextHash != rec.Records[1].ContextHash {
		t.Fatalf("same context produced different hashes: %s vs %s", rec.Records[0].ContextHash, rec.Records[1].ContextHash)
	}
	if rec.Records[0].Effect != rec.Records[1].Effect {
		t.Fatalf("same request produced different effects")
	}

	// different context → different hash
	r := permitReq()
	r.Context = map[string]any{"human_approval": true, "verdict": "ROOT_CAUSE_CONFIRMED"}
	_, _ = svc.Authorize(context.Background(), r, PhaseInvocation)
	if rec.Records[2].ContextHash == rec.Records[0].ContextHash {
		t.Fatalf("different context produced identical hash %s", rec.Records[2].ContextHash)
	}
}

type failRecorder struct{}

func (failRecorder) Record(context.Context, PolicyDecisionRecord) error {
	return errors.New("ledger unavailable")
}

func TestAuthorizeFailsClosedWhenRecorderFails(t *testing.T) {
	svc := NewService(newTestEngine(t), failRecorder{}, "t_acme")
	d, err := svc.Authorize(context.Background(), permitReq(), PhaseInvocation)
	if err == nil {
		t.Fatal("expected fail-closed error when the recorder fails, got nil")
	}
	if d.Effect != "" || d.DecisionRecordID != "" {
		t.Errorf("expected zero Decision on record failure, got %+v", d)
	}
}
