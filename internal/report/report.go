// Package report renders findings as human text or stable JSON.
package report

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/PurnaOS/iBuildOS/internal/model"
)

// Text writes a human-readable report. Findings must already be finalized
// (sorted + deduped).
func Text(w io.Writer, findings []model.Finding) {
	for _, f := range findings {
		loc := f.File
		if f.Line > 0 {
			loc = fmt.Sprintf("%s:%d", f.File, f.Line)
		}
		fmt.Fprintf(w, "%s: %s [%s] %s\n", loc, f.Severity, f.Rule, f.Message)
	}
	errs, warns := model.CountBySeverity(findings)
	if len(findings) == 0 {
		fmt.Fprintln(w, "OK: no problems found")
		return
	}
	fmt.Fprintf(w, "\n%s, %s\n", plural(errs, "error"), plural(warns, "warning"))
}

type jsonReport struct {
	Version  string          `json:"version"`
	Summary  jsonSummary     `json:"summary"`
	Findings []model.Finding `json:"findings"`
}

type jsonSummary struct {
	Errors   int `json:"errors"`
	Warnings int `json:"warnings"`
}

// JSON writes the stable machine-readable report (the contract the Action parses).
func JSON(w io.Writer, findings []model.Finding) error {
	errs, warns := model.CountBySeverity(findings)
	if findings == nil {
		findings = []model.Finding{}
	}
	rep := jsonReport{
		Version:  "1",
		Summary:  jsonSummary{Errors: errs, Warnings: warns},
		Findings: findings,
	}
	b, err := json.MarshalIndent(rep, "", "  ")
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(w, string(b))
	return err
}

func plural(n int, word string) string {
	if n == 1 {
		return fmt.Sprintf("1 %s", word)
	}
	return fmt.Sprintf("%d %ss", n, word)
}
