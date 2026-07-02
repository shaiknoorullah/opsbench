package policygateway

import _ "embed"

// DefaultPlatformPolicy is the built-in platform Cedar policy set (policies/platform.cedar),
// embedded so the binary and tests share one validated default. Production overrides it with
// a tenant policy set loaded from the policy store.
//
//go:embed policies/platform.cedar
var DefaultPlatformPolicy []byte
