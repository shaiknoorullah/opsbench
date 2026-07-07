package spine

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// newBareServer builds a spine with NO in-process seeding — everything must be registered
// over the admin API. This is the standalone-server proof.
func newBareServer(t *testing.T) *httptest.Server {
	t.Helper()
	sp, err := New(Config{TenantID: srvTenant, EligibleReviewers: []string{srvReviewer}})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	ts := httptest.NewServer(NewServer(sp))
	t.Cleanup(func() { ts.Close(); sp.Close() })
	return ts
}

type proposeResult struct {
	status int
	body   resultResponse
}

// proposeAs POSTs an action that long-polls through the approval gate.
func proposeAs(base string, body actionRequest) <-chan proposeResult {
	ch := make(chan proposeResult, 1)
	go func() {
		st, b, _ := do(http.MethodPost, base+"/v1/actions", body)
		var r resultResponse
		_ = json.Unmarshal(b, &r)
		ch <- proposeResult{st, r}
	}()
	return ch
}

// registerSRE registers an active SRE agent (permitted the prod scope) and an SRE-owned
// demo tool over the admin API, asserting success.
func registerSRE(t *testing.T, base, agentID, toolName string) {
	t.Helper()
	st, body, err := do(http.MethodPost, base+"/v1/agents", agentRequest{
		ID: agentID, Teams: []string{"sre"}, Scopes: []string{"scope://t_acme/env/prod/*"},
		Owner: "usr_alice", Autonomy: 3,
	})
	if err != nil || st != http.StatusOK {
		t.Fatalf("register agent: status %d err %v body %s", st, err, body)
	}
	st, body, err = do(http.MethodPost, base+"/v1/tools", toolRequest{
		Name: toolName, Kind: "demo", Parents: []string{"sre"},
		Attrs: map[string]any{"env": "prod", "danger": false, "read_only": false},
	})
	if err != nil || st != http.StatusOK {
		t.Fatalf("register tool: status %d err %v body %s", st, err, body)
	}
}

func adminAction(agentID, toolName, taskID string) actionRequest {
	return actionRequest{
		Agent: agentID, Tool: toolName, Resource: "scope://t_acme/env/prod/service/api",
		Payload: map[string]any{"graceful": true}, Justification: "admin flow", OnBehalfOf: "usr_alice", TaskID: taskID,
	}
}

// TestAdmin_RegisterThenExecute is the standalone-server milestone: with nothing seeded
// in-process, an operator registers an identity + tool over HTTP and the governed-action
// flow then runs end-to-end for them.
func TestAdmin_RegisterThenExecute(t *testing.T) {
	ts := newBareServer(t)
	const agent = "spiffe://t_acme/agent/http-1"

	registerSRE(t, ts.URL, agent, "k8s.restart")

	// The registration is retrievable over the API before we rely on it (agent + tool).
	if st, body, _ := do(http.MethodGet, ts.URL+"/v1/agents?id="+agent, nil); st != http.StatusOK {
		t.Fatalf("registered agent should be retrievable: %d %s", st, body)
	}
	if st, body, _ := do(http.MethodGet, ts.URL+"/v1/tools", nil); st != http.StatusOK || !strings.Contains(string(body), "k8s.restart") {
		t.Fatalf("registered tool should be listed: %d %s", st, body)
	}

	done := proposeAs(ts.URL, adminAction(agent, "k8s.restart", "tsk_admin"))
	appr := waitApproval(t, ts.URL, "tsk_admin")
	st, _, err := do(http.MethodPost, ts.URL+"/v1/approvals/"+appr.ID+"/decide",
		decideRequest{Decision: "approve", By: srvReviewer, PayloadHashSeen: appr.PayloadHash})
	if err != nil || st != http.StatusOK {
		t.Fatalf("decide: status %d err %v", st, err)
	}
	out := <-done
	if out.status != http.StatusOK || out.body.Outcome != "executed" {
		t.Fatalf("HTTP-registered identity should execute, got %d/%s (%s)", out.status, out.body.Outcome, out.body.Reason)
	}

	ev := getEvidence(t, ts.URL)
	if !ev.Verified {
		t.Fatalf("evidence chain must verify, got %+v", ev)
	}
}

func TestAdmin_ListGetRevokeAgents(t *testing.T) {
	ts := newBareServer(t)
	registerSRE(t, ts.URL, "spiffe://t_acme/agent/a1", "tool.a")
	// second agent (reuse the tool)
	if st, _, _ := do(http.MethodPost, ts.URL+"/v1/agents", agentRequest{ID: "spiffe://t_acme/agent/a2", Teams: []string{"payments"}, Autonomy: 1}); st != http.StatusOK {
		t.Fatalf("register a2: %d", st)
	}

	// list
	st, body, _ := do(http.MethodGet, ts.URL+"/v1/agents", nil)
	if st != http.StatusOK {
		t.Fatalf("list: %d", st)
	}
	var list []agentResponse
	_ = json.Unmarshal(body, &list)
	if len(list) != 2 {
		t.Fatalf("want 2 agents, got %d", len(list))
	}

	// get one
	st, body, _ = do(http.MethodGet, ts.URL+"/v1/agents?id=spiffe://t_acme/agent/a1", nil)
	if st != http.StatusOK {
		t.Fatalf("get a1: %d", st)
	}
	var a1 agentResponse
	_ = json.Unmarshal(body, &a1)
	if a1.ID != "spiffe://t_acme/agent/a1" || a1.Autonomy != "L3" {
		t.Fatalf("unexpected a1: %+v", a1)
	}

	// get unknown -> 404
	if st, _, _ := do(http.MethodGet, ts.URL+"/v1/agents?id=nope", nil); st != http.StatusNotFound {
		t.Fatalf("unknown agent want 404, got %d", st)
	}

	// revoke a1
	if st, _, _ := do(http.MethodDelete, ts.URL+"/v1/agents?id=spiffe://t_acme/agent/a1", nil); st != http.StatusOK {
		t.Fatalf("revoke a1: %d", st)
	}
	// a1 is now gone from get + list
	if st, _, _ := do(http.MethodGet, ts.URL+"/v1/agents?id=spiffe://t_acme/agent/a1", nil); st != http.StatusNotFound {
		t.Fatalf("revoked a1 should be 404, got %d", st)
	}
	st, body, _ = do(http.MethodGet, ts.URL+"/v1/agents", nil)
	_ = json.Unmarshal(body, &list)
	if len(list) != 1 {
		t.Fatalf("after revoke want 1 agent, got %d", len(list))
	}

	// revoke unknown -> 404; revoke without id -> 400
	if st, _, _ := do(http.MethodDelete, ts.URL+"/v1/agents?id=ghost", nil); st != http.StatusNotFound {
		t.Fatalf("revoke unknown want 404, got %d", st)
	}
	if st, _, _ := do(http.MethodDelete, ts.URL+"/v1/agents", nil); st != http.StatusBadRequest {
		t.Fatalf("revoke without id want 400, got %d", st)
	}
}

func TestAdmin_RevokedAgentCannotExecute(t *testing.T) {
	ts := newBareServer(t)
	const agent = "spiffe://t_acme/agent/http-2"
	registerSRE(t, ts.URL, agent, "k8s.restart")

	if st, _, _ := do(http.MethodDelete, ts.URL+"/v1/agents?id="+agent, nil); st != http.StatusOK {
		t.Fatalf("revoke: %d", st)
	}
	// denied at policy (no teams) — no approval gate reached
	st, body, _ := do(http.MethodPost, ts.URL+"/v1/actions", adminAction(agent, "k8s.restart", "tsk_rev"))
	if st != http.StatusForbidden {
		t.Fatalf("revoked agent action should be 403, got %d body %s", st, body)
	}
}

// TestAdmin_ReregistrationClearsRevocation covers the documented upsert behavior: posting
// an already-revoked id again reactivates it with the new fields.
func TestAdmin_ReregistrationClearsRevocation(t *testing.T) {
	ts := newBareServer(t)
	const agent = "spiffe://t_acme/agent/re-1"

	if st, _, _ := do(http.MethodPost, ts.URL+"/v1/agents", agentRequest{ID: agent, Teams: []string{"sre"}, Autonomy: 2}); st != http.StatusOK {
		t.Fatalf("register: %d", st)
	}
	if st, _, _ := do(http.MethodDelete, ts.URL+"/v1/agents?id="+agent, nil); st != http.StatusOK {
		t.Fatalf("revoke: %d", st)
	}
	if st, _, _ := do(http.MethodGet, ts.URL+"/v1/agents?id="+agent, nil); st != http.StatusNotFound {
		t.Fatalf("revoked agent should be 404, got %d", st)
	}

	// re-register the same id with new fields — clears the revocation
	if st, _, _ := do(http.MethodPost, ts.URL+"/v1/agents", agentRequest{ID: agent, Teams: []string{"payments"}, Owner: "usr_bob", Autonomy: 4}); st != http.StatusOK {
		t.Fatalf("re-register: %d", st)
	}
	st, body, _ := do(http.MethodGet, ts.URL+"/v1/agents?id="+agent, nil)
	if st != http.StatusOK {
		t.Fatalf("re-registered agent should be active (200), got %d", st)
	}
	var a agentResponse
	_ = json.Unmarshal(body, &a)
	if a.Autonomy != "L4" || a.Owner != "usr_bob" || len(a.Teams) != 1 || a.Teams[0] != "payments" {
		t.Fatalf("re-registration should replace fields, got %+v", a)
	}
}

func TestAdmin_ListTools(t *testing.T) {
	ts := newBareServer(t)
	for _, n := range []string{"k8s.scale", "k8s.restart"} {
		if st, _, _ := do(http.MethodPost, ts.URL+"/v1/tools", toolRequest{Name: n, Kind: "demo", Parents: []string{"sre"}}); st != http.StatusOK {
			t.Fatalf("register %s: %d", n, st)
		}
	}
	st, body, _ := do(http.MethodGet, ts.URL+"/v1/tools", nil)
	if st != http.StatusOK {
		t.Fatalf("list tools: %d", st)
	}
	var tools []toolResponse
	_ = json.Unmarshal(body, &tools)
	if len(tools) != 2 || tools[0].Name != "k8s.restart" || tools[1].Name != "k8s.scale" {
		t.Fatalf("unexpected tool list (want sorted [k8s.restart k8s.scale]): %+v", tools)
	}
}

func TestAdmin_Validation(t *testing.T) {
	ts := newBareServer(t)
	cases := []struct {
		name    string
		method  string
		path    string
		body    any
		want    int
		wantMsg string
	}{
		{"agent missing id", http.MethodPost, "/v1/agents", agentRequest{Teams: []string{"sre"}}, http.StatusBadRequest, "id is required"},
		{"agent autonomy too high", http.MethodPost, "/v1/agents", agentRequest{ID: "x", Autonomy: 5}, http.StatusBadRequest, "autonomy"},
		{"tool missing name", http.MethodPost, "/v1/tools", toolRequest{Kind: "demo"}, http.StatusBadRequest, "name is required"},
		{"tool unknown kind", http.MethodPost, "/v1/tools", toolRequest{Name: "x", Kind: "wat"}, http.StatusBadRequest, "unknown tool kind"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			st, body, err := do(c.method, ts.URL+c.path, c.body)
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			if st != c.want {
				t.Fatalf("want status %d, got %d", c.want, st)
			}
			if !strings.Contains(string(body), c.wantMsg) { // pin which validation fired
				t.Fatalf("want error containing %q, got %s", c.wantMsg, body)
			}
		})
	}
}

// TestAdmin_ConcurrentAccessIsRaceFree exercises dynamic registration (writes to the C7
// registry, the C1 tool store, and the C2 tool map) concurrently with an action's Execute
// (reads of those maps) and list reads. A missing mutex fails this two ways: the Go
// runtime's always-on concurrent-map-access check panics under plain `go test`, and the
// race detector flags it under `go test -race`.
func TestAdmin_ConcurrentAccessIsRaceFree(t *testing.T) {
	ts := newBareServer(t)
	const base = "spiffe://t_acme/agent/base"
	registerSRE(t, ts.URL, base, "k8s.scale")

	stop := make(chan struct{})
	var wg sync.WaitGroup
	// same-id upsert contention: several goroutines re-register the same agent + tool.
	for k := 0; k < 3; k++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				_, _, _ = do(http.MethodPost, ts.URL+"/v1/agents", agentRequest{ID: "spiffe://t_acme/agent/hot", Teams: []string{"sre"}})
				_, _, _ = do(http.MethodPost, ts.URL+"/v1/tools", toolRequest{Name: "hot", Kind: "demo", Parents: []string{"sre"}})
			}
		}()
	}
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; ; j++ {
				select {
				case <-stop:
					return
				default:
				}
				switch (i + j) % 4 {
				case 0:
					_, _, _ = do(http.MethodPost, ts.URL+"/v1/agents", agentRequest{ID: fmt.Sprintf("spiffe://t_acme/agent/x%d-%d", i, j), Teams: []string{"sre"}})
				case 1:
					_, _, _ = do(http.MethodPost, ts.URL+"/v1/tools", toolRequest{Name: fmt.Sprintf("t%d-%d", i, j), Kind: "demo", Parents: []string{"sre"}})
				case 2:
					_, _, _ = do(http.MethodGet, ts.URL+"/v1/agents", nil)
				case 3:
					_, _, _ = do(http.MethodGet, ts.URL+"/v1/tools", nil)
				}
			}
		}(i)
	}

	// Main goroutine: run a full action (its Execute reads the tool maps) amid the churn.
	done := proposeAs(ts.URL, adminAction(base, "k8s.scale", "tsk_conc"))
	appr := waitApproval(t, ts.URL, "tsk_conc")
	if st, _, err := do(http.MethodPost, ts.URL+"/v1/approvals/"+appr.ID+"/decide",
		decideRequest{Decision: "approve", By: srvReviewer, PayloadHashSeen: appr.PayloadHash}); err != nil || st != http.StatusOK {
		t.Fatalf("decide: status %d err %v", st, err)
	}
	out := <-done
	close(stop)
	wg.Wait()
	if out.status != http.StatusOK || out.body.Outcome != "executed" {
		t.Fatalf("action under concurrent registration should execute, got %d/%s", out.status, out.body.Outcome)
	}
}
