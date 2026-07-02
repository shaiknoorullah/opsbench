package policygateway

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

const serverPolicy = `
@tier("2")
permit ( principal in Team::"sre", action == Action::"invoke", resource in Team::"sre" );
permit ( principal in Team::"sre", action == Action::"list",   resource in Team::"sre" );
`

func newTestServer(t *testing.T) (*httptest.Server, *MemoryRecorder) {
	t.Helper()
	eng, err := NewCedarEngine([]byte(serverPolicy))
	if err != nil {
		t.Fatal(err)
	}
	rec := &MemoryRecorder{}
	store := NewMemoryStore()
	store.SetAgentTeams("agent-1", "sre")
	store.SetTool("k8s.scale", ToolMeta{Parents: []string{"sre"}, Attrs: map[string]any{"env": "prod"}})
	svc := NewService(eng, rec, "t_acme", WithStore(store))
	ts := httptest.NewServer(NewServer(svc, NewToolFilter(eng)))
	t.Cleanup(ts.Close)
	return ts, rec
}

func postJSON(t *testing.T, url string, body, out any) int {
	t.Helper()
	b, _ := json.Marshal(body)
	resp, err := http.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if out != nil {
		_ = json.NewDecoder(resp.Body).Decode(out)
	}
	return resp.StatusCode
}

func TestServerDecide(t *testing.T) {
	ts, rec := newTestServer(t)

	var resp decideResponse
	code := postJSON(t, ts.URL+"/v1/decide",
		decideRequest{Principal: "agent-1", Tool: "k8s.scale", Resource: "scope://x"}, &resp)
	if code != http.StatusOK || resp.Effect != "permit" || resp.Tier != 2 || resp.DecisionRecordID == "" {
		t.Fatalf("permit: code=%d resp=%+v", code, resp)
	}
	if len(rec.Records) != 1 {
		t.Fatalf("expected 1 PDR recorded, got %d", len(rec.Records))
	}

	resp = decideResponse{}
	code = postJSON(t, ts.URL+"/v1/decide",
		decideRequest{Principal: "stranger", Tool: "k8s.scale", Resource: "scope://x"}, &resp)
	if code != http.StatusOK || resp.Effect != "deny" {
		t.Fatalf("unknown agent should deny: code=%d resp=%+v", code, resp)
	}
}

func TestServerDecideFailsClosedOnBadJSON(t *testing.T) {
	ts, _ := newTestServer(t)
	resp, err := http.Post(ts.URL+"/v1/decide", "application/json", bytes.NewReader([]byte("{not json")))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out decideResponse
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if resp.StatusCode != http.StatusBadRequest || out.Effect != "deny" {
		t.Fatalf("bad json must fail closed (deny), got code=%d effect=%q", resp.StatusCode, out.Effect)
	}
}

func TestServerFilter(t *testing.T) {
	ts, _ := newTestServer(t)
	var out filterResponse
	code := postJSON(t, ts.URL+"/v1/tools/filter", filterRequest{
		Principal:      "agent-1",
		PrincipalTeams: []string{"sre"},
		Tools: []ToolRef{
			{ID: "ta1", Parents: []string{"sre"}},
			{ID: "tb1", Parents: []string{"other"}},
		},
	}, &out)
	if code != http.StatusOK {
		t.Fatalf("code=%d", code)
	}
	if len(out.Allowed) != 1 || out.Allowed[0] != "ta1" {
		t.Fatalf("expected [ta1], got %v", out.Allowed)
	}
}
