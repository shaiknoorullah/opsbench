package gatekeeper

import (
	"context"

	credentialbroker "github.com/shaiknoorullah/opsbench/platform/services/credential-broker"
)

// credentialAdapter bridges the gatekeeper's CredentialBroker seam to the in-process C4
// broker. The gatekeeper hands thin ids (agent SPIFFE id, task id, resource scope); C4
// gates on the agent's C7 identity and mints a short-lived, scope-intersected credential.
type credentialAdapter struct {
	broker *credentialbroker.Broker
}

// NewCredentialAdapter wraps an in-process C4 broker as a gatekeeper CredentialBroker.
func NewCredentialAdapter(b *credentialbroker.Broker) CredentialBroker {
	return &credentialAdapter{broker: b}
}

func (a *credentialAdapter) MintWrite(ctx context.Context, agent, taskID, scope string) (Credential, error) {
	c, err := a.broker.Mint(ctx, agent, taskID, scope)
	if err != nil {
		return Credential{}, err // C2 fails closed on a broker error (Execute step 8)
	}
	return Credential{Token: c.Token, ExpiresAt: c.ExpiresAt}, nil
}
