package spine

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
	identityregistry "github.com/shaiknoorullah/opsbench/platform/services/identity-registry"
)

const (
	srvTenant   = "t_acme"
	srvAgent    = "spiffe://t_acme/agent/inv-7"
	srvReviewer = "usr_oncall"
	srvTool     = "k8s.scale"
	srvScope    = "scope://t_acme/env/prod/service/checkout"
)

// newHTTPTestServer builds a seeded spine behind an httptest.Server.
func newHTTPTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	sp, err := New(Config{TenantID: srvTenant, EligibleReviewers: []string{srvReviewer}})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	sp.RegisterAgent(identityregistry.Agent{
		ID: srvAgent, TenantID: srvTenant, Teams: []string{"sre"},
		Scopes: []string{"scope://t_acme/env/prod/*"}, Owner: "usr_alice",
	})
	sp.RegisterTool([]string{"sre"}, map[string]any{"env": "prod", "danger": false}, NewDemoTool(srvTool))
	ts := httptest.NewServer(NewServer(sp))
	t.Cleanup(func() { ts.Close(); sp.Close() })
	return ts
}

// do issues a JSON request. It returns an error rather than calling t.Fatal, so it is safe
// to call from a goroutine (the long-polling action request runs in one).
func do(method, url string, body any) (int, []byte, error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		return 0, nil, err
	}
	client := http.Client{Timeout: 10 * time.Second} // backstop so a stuck long-poll can't hang the suite
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, out, nil
}

func actionBody(taskID string) actionRequest {
	return actionRequest{
		Agent: srvAgent, Tool: srvTool, Resource: srvScope,
		Payload: map[string]any{"replicas": 6}, Justification: "scale out",
		OnBehalfOf: "usr_alice", TaskID: taskID,
	}
}

// waitApproval polls the pending-approval endpoint until the action's Execute has created it.
func waitApproval(t *testing.T, base, ref string) approvalResponse {
	t.Helper()
	for i := 0; i < 500; i++ {
		st, body, err := do(http.MethodGet, base+"/v1/approvals/by-action/"+ref, nil)
		if err != nil {
			t.Fatalf("get approval: %v", err)
		}
		if st == http.StatusOK {
			var a approvalResponse
			if err := json.Unmarshal(body, &a); err != nil {
				t.Fatalf("decode approval: %v", err)
			}
			if a.State == "pending" {
				return a
			}
		}
		time.Sleep(3 * time.Millisecond)
	}
	t.Fatalf("approval for %s never appeared", ref)
	return approvalResponse{}
}

// proposeAsync POSTs an action that long-polls through the approval gate, returning a
// channel that yields (status, result) once the request completes.
func proposeAsync(base, taskID string) <-chan struct {
	status int
	body   resultResponse
} {
	ch := make(chan struct {
		status int
		body   resultResponse
	}, 1)
	go func() {
		st, body, _ := do(http.MethodPost, base+"/v1/actions", actionBody(taskID))
		var r resultResponse
		_ = json.Unmarshal(body, &r)
		ch <- struct {
			status int
			body   resultResponse
		}{st, r}
	}()
	return ch
}

func TestServer_GoldenFlow_ProposeApproveExecuteVerify(t *testing.T) {
	ts := newHTTPTestServer(t)

	done := proposeAsync(ts.URL, "tsk_http") // long-polls through the approval gate

	// Reviewer sees the pending approval and attests the pinned payload hash (GOV-004).
	appr := waitApproval(t, ts.URL, "tsk_http")
	if appr.Tier != 2 || appr.PayloadHash == "" {
		t.Fatalf("unexpected pending approval: %+v", appr)
	}
	// GOV-004: the pinned hash must be the real hash of the action payload — the artifact
	// the reviewer attests. If it weren't, a payload-swap could execute unseen.
	canon, _ := auditledger.Canonicalize(actionBody("tsk_http").Payload)
	if want := auditledger.SHA256(canon); appr.PayloadHash != want {
		t.Fatalf("GOV-004: approval hash %s != actual payload hash %s", appr.PayloadHash, want)
	}

	// The action is still blocked at the gate — reading evidence mid-flight must return a
	// consistent, verifiable partial chain (concurrent store read vs the appender's writes).
	if mid := getEvidence(t, ts.URL); !mid.Verified || !equalKindEffects(mid.Records, []string{"policy_decision:permit", "approval:deny"}) {
		t.Fatalf("mid-flight evidence unexpected: verified=%v seq=%v", mid.Verified, kindEffectSeq(mid.Records))
	}

	st, body, err := do(http.MethodPost, ts.URL+"/v1/approvals/"+appr.ID+"/decide",
		decideRequest{Decision: "approve", By: srvReviewer, PayloadHashSeen: appr.PayloadHash})
	if err != nil {
		t.Fatalf("decide: %v", err)
	}
	if st != http.StatusOK {
		t.Fatalf("decide: status %d body %s", st, body)
	}

	out := <-done
	if out.status != http.StatusOK || out.body.Outcome != "executed" {
		t.Fatalf("action: status=%d outcome=%s reason=%s err=%s", out.status, out.body.Outcome, out.body.Reason, out.body.Error)
	}
	if out.body.Tier != 2 {
		t.Errorf("want tier 2, got %d", out.body.Tier)
	}

	// Evidence — offline-verifiable, in the normative order: policy → approval(created,
	// approved) → execution.
	ev := getEvidence(t, ts.URL)
	if !ev.Verified {
		t.Fatalf("evidence chain failed offline verification (%d records)", ev.RecordsChecked)
	}
	want := []string{"policy_decision:permit", "approval:deny", "approval:permit", "tool_call:permit"}
	if !equalKindEffects(ev.Records, want) {
		t.Fatalf("evidence sequence = %v, want %v", kindEffectSeq(ev.Records), want)
	}
}

func TestServer_RejectedApprovalReturns403(t *testing.T) {
	ts := newHTTPTestServer(t)
	done := proposeAsync(ts.URL, "tsk_rej")

	appr := waitApproval(t, ts.URL, "tsk_rej")
	st, _, err := do(http.MethodPost, ts.URL+"/v1/approvals/"+appr.ID+"/decide",
		decideRequest{Decision: "reject", By: srvReviewer, PayloadHashSeen: appr.PayloadHash})
	if err != nil || st != http.StatusOK {
		t.Fatalf("decide reject: status %d err %v", st, err)
	}
	out := <-done
	if out.status != http.StatusForbidden || out.body.Outcome != "denied" {
		t.Fatalf("rejected action should be 403/denied, got %d/%s", out.status, out.body.Outcome)
	}
	if !strings.Contains(out.body.Reason, "reject") { // pin the deny reason to the rejection path
		t.Errorf("deny reason should mention rejection, got %q", out.body.Reason)
	}
}

func TestServer_UnknownAgentReturns403(t *testing.T) {
	ts := newHTTPTestServer(t)
	req := actionBody("tsk_ghost")
	req.Agent = "spiffe://t_acme/agent/ghost" // never registered — denied at policy, no approval gate
	st, body, err := do(http.MethodPost, ts.URL+"/v1/actions", req)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	if st != http.StatusForbidden {
		t.Fatalf("unknown agent should be 403, got %d", st)
	}
	var r resultResponse
	_ = json.Unmarshal(body, &r)
	if !strings.Contains(r.Reason, "policy") { // pin the deny reason to the policy default-deny path
		t.Errorf("deny reason should mention policy, got %q", r.Reason)
	}
}

func TestServer_MissingFieldsReturns400(t *testing.T) {
	ts := newHTTPTestServer(t)
	st, _, err := do(http.MethodPost, ts.URL+"/v1/actions", actionRequest{Agent: srvAgent}) // no tool/task_id
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	if st != http.StatusBadRequest {
		t.Fatalf("want 400 for missing fields, got %d", st)
	}
}

func TestServer_IneligibleDecideReturns403(t *testing.T) {
	ts := newHTTPTestServer(t)
	done := proposeAsync(ts.URL, "tsk_inel")

	appr := waitApproval(t, ts.URL, "tsk_inel")
	st, _, err := do(http.MethodPost, ts.URL+"/v1/approvals/"+appr.ID+"/decide",
		decideRequest{Decision: "approve", By: "usr_stranger", PayloadHashSeen: appr.PayloadHash})
	if err != nil {
		t.Fatalf("decide: %v", err)
	}
	if st != http.StatusForbidden {
		t.Fatalf("ineligible decide should be 403, got %d", st)
	}
	// The action is still pending; approve it properly so the long-poll completes and the
	// server can be torn down cleanly.
	if _, _, err := do(http.MethodPost, ts.URL+"/v1/approvals/"+appr.ID+"/decide",
		decideRequest{Decision: "approve", By: srvReviewer, PayloadHashSeen: appr.PayloadHash}); err != nil {
		t.Fatalf("cleanup approve: %v", err)
	}
	<-done
}

func TestServer_ApprovalNotFoundReturns404(t *testing.T) {
	ts := newHTTPTestServer(t)
	st, _, err := do(http.MethodGet, ts.URL+"/v1/approvals/by-action/does-not-exist", nil)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if st != http.StatusNotFound {
		t.Fatalf("want 404, got %d", st)
	}
}

// TestServer_WrongPayloadHashDeniesViaInvalidation is the GOV-004 payload-swap guard over
// HTTP: a reviewer who attests a hash that does not match the pinned payload cannot
// authorize execution — the approval is invalidated and the action is denied.
func TestServer_WrongPayloadHashDeniesViaInvalidation(t *testing.T) {
	ts := newHTTPTestServer(t)
	done := proposeAsync(ts.URL, "tsk_swap")

	appr := waitApproval(t, ts.URL, "tsk_swap")
	st, _, err := do(http.MethodPost, ts.URL+"/v1/approvals/"+appr.ID+"/decide",
		decideRequest{Decision: "approve", By: srvReviewer, PayloadHashSeen: "sha256:deadbeefdeadbeef"})
	if err != nil || st != http.StatusOK { // Decide records the mismatch and invalidates the object
		t.Fatalf("decide: status %d err %v", st, err)
	}

	out := <-done
	if out.status != http.StatusForbidden || out.body.Outcome != "denied" {
		t.Fatalf("GOV-004 hash mismatch must deny, got %d/%s", out.status, out.body.Outcome)
	}
	// Distinguish invalidation from a plain rejection — the approval object is invalidated.
	st, body, _ := do(http.MethodGet, ts.URL+"/v1/approvals/by-action/tsk_swap", nil)
	if st != http.StatusOK {
		t.Fatalf("get approval: status %d", st)
	}
	var a2 approvalResponse
	_ = json.Unmarshal(body, &a2)
	if a2.State != "invalidated" {
		t.Fatalf("approval should be invalidated by the GOV-004 mismatch, got %q", a2.State)
	}
}

// --- evidence helpers ---

func getEvidence(t *testing.T, base string) evidenceResponse {
	t.Helper()
	st, body, err := do(http.MethodGet, base+"/v1/evidence", nil)
	if err != nil || st != http.StatusOK {
		t.Fatalf("evidence: status %d err %v", st, err)
	}
	var ev evidenceResponse
	if err := json.Unmarshal(body, &ev); err != nil {
		t.Fatalf("decode evidence: %v", err)
	}
	return ev
}

func kindEffectSeq(recs []evidenceRecord) []string {
	out := make([]string, len(recs))
	for i, r := range recs {
		out[i] = r.Kind + ":" + r.Effect
	}
	return out
}

func equalKindEffects(recs []evidenceRecord, want []string) bool {
	got := kindEffectSeq(recs)
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
