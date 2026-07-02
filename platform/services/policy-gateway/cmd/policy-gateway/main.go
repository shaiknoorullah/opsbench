// Command policy-gateway runs C1 — the Policy Decision Point — as an HTTP service.
//
// Usage:
//
//	policy-gateway [-addr :8080] [-tenant <id>] [-policy <file>]
//
// With no -policy it serves the built-in platform policy set. Decisions are logged as
// JSON lines (a development recorder); production wires the C5 audit ledger. The entity
// store is empty by default (unknown agents default-deny) until C7/C10 populate it.
package main

import (
	"flag"
	"log"
	"net/http"
	"os"

	policygateway "github.com/shaiknoorullah/opsbench/platform/services/policy-gateway"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	tenant := flag.String("tenant", "default", "tenant id")
	policyPath := flag.String("policy", "", "Cedar policy file (default: built-in platform policy set)")
	flag.Parse()

	src := policygateway.DefaultPlatformPolicy
	if *policyPath != "" {
		b, err := os.ReadFile(*policyPath)
		if err != nil {
			log.Fatalf("policy-gateway: read policy %q: %v", *policyPath, err)
		}
		src = b
	}

	engine, err := policygateway.NewCedarEngine(src)
	if err != nil {
		log.Fatalf("policy-gateway: parse policy set: %v", err)
	}

	svc := policygateway.NewService(engine, policygateway.LogRecorder{}, *tenant,
		policygateway.WithStore(policygateway.NewMemoryStore()))
	srv := policygateway.NewServer(svc, policygateway.NewToolFilter(engine))

	log.Printf("policy-gateway (C1) listening on %s (tenant=%s, policyVersion=%s)", *addr, *tenant, engine.PolicyVersion())
	if err := http.ListenAndServe(*addr, srv); err != nil {
		log.Fatalf("policy-gateway: %v", err)
	}
}
