package gatekeeper

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// httpPolicyAdapter is a gatekeeper PolicyEngine backed by C1's HTTP surface, for
// deployments where the policy gateway runs as a separate process. Any transport error or
// non-2xx response is a fail-closed deny (returned as an error so C2 denies the action). A
// policy deny is a normal 200 response with effect="deny".
type httpPolicyAdapter struct {
	baseURL string
	client  *http.Client
}

// NewHTTPPolicyAdapter wraps a remote C1 policy gateway (its base URL) as a PolicyEngine.
func NewHTTPPolicyAdapter(baseURL string, client *http.Client) PolicyEngine {
	if client == nil {
		client = http.DefaultClient
	}
	return &httpPolicyAdapter{baseURL: strings.TrimRight(baseURL, "/"), client: client}
}

func (p *httpPolicyAdapter) Decide(ctx context.Context, principal, action, resource string, attrs map[string]any) (Decision, error) {
	body, _ := json.Marshal(map[string]any{
		"principal": principal,
		"tool":      strings.TrimPrefix(action, "tool:"),
		"resource":  resource,
		"context":   attrs,
		"phase":     "invocation",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/v1/decide", bytes.NewReader(body))
	if err != nil {
		return Decision{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return Decision{}, err // fail closed
	}
	defer resp.Body.Close()

	var out struct {
		Effect           string   `json:"effect"`
		Tier             int      `json:"tier"`
		PolicyRefs       []string `json:"policy_refs"`
		DecisionRecordID string   `json:"decision_record_id"`
		Reason           string   `json:"reason"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if resp.StatusCode != http.StatusOK {
		return Decision{Effect: "deny"}, fmt.Errorf("policy gateway http %d: %s", resp.StatusCode, out.Reason)
	}
	return Decision{
		Effect:           out.Effect,
		Tier:             out.Tier,
		PolicyRefs:       out.PolicyRefs,
		DecisionRecordID: out.DecisionRecordID,
	}, nil
}
