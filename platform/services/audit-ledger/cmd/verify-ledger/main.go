// verify-ledger: offline ledger verification CLI (IDN-001 / UC-011). Reads an export
// bundle { "records": [...], "checkpoints": [...] } from a file argument or stdin and
// validates it with no platform or database access. Exit 0 = intact, 1 = failure.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
)

func main() {
	var (
		data []byte
		err  error
	)
	if len(os.Args) > 1 && os.Args[1] != "-" {
		data, err = os.ReadFile(os.Args[1])
	} else {
		data, err = io.ReadAll(os.Stdin)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "read error:", err)
		os.Exit(2)
	}

	var bundle struct {
		Records     []auditledger.AuditRecord `json:"records"`
		Checkpoints []auditledger.Checkpoint  `json:"checkpoints"`
	}
	if err := json.Unmarshal(data, &bundle); err != nil {
		fmt.Fprintln(os.Stderr, "parse error:", err)
		os.Exit(2)
	}

	res := auditledger.VerifyChain(bundle.Records, bundle.Checkpoints)
	if res.OK {
		fmt.Printf("OK  %d records, %d checkpoints verified\n", res.RecordsChecked, res.CheckpointsChecked)
		os.Exit(0)
	}
	fmt.Fprintf(os.Stderr, "FAIL  %d error(s):\n", len(res.Errors))
	for _, e := range res.Errors {
		fmt.Fprintln(os.Stderr, "  - "+e)
	}
	os.Exit(1)
}
