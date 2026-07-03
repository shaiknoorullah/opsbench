package policygateway

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
)

// LogRecorder is a Recorder that writes each PolicyDecisionRecord as a JSON line. It is a
// development default; production wires the C5 audit ledger so decisions are durable and
// tamper-evident (a log line is not durable evidence for DP-3).
type LogRecorder struct {
	W io.Writer // defaults to os.Stderr
}

// Record writes the decision record as a JSON line.
func (l LogRecorder) Record(_ context.Context, rec PolicyDecisionRecord) error {
	w := l.W
	if w == nil {
		w = os.Stderr
	}
	b, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(w, string(b))
	return err
}
