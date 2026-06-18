// Package model holds the dependency-free types shared across all layers:
// the Finding currency and a Collector that accumulates them.
package model

import (
	"fmt"
	"path/filepath"
	"sort"
)

type Severity string

const (
	Error   Severity = "error"
	Warning Severity = "warning"
)

// Finding is the single currency of the tool. Everything reduces to a sorted,
// deduped list of these. It is comparable so it can be a map key for dedup.
type Finding struct {
	Severity Severity `json:"severity"`
	File     string   `json:"file"`
	Line     int      `json:"line,omitempty"`
	Rule     string   `json:"rule"`
	Message  string   `json:"message"`
}

// Collector accumulates findings during a run.
type Collector struct {
	Items []Finding
}

func (c *Collector) add(sev Severity, file string, line int, rule, format string, a ...any) {
	c.Items = append(c.Items, Finding{
		Severity: sev,
		File:     filepath.ToSlash(file),
		Line:     line,
		Rule:     rule,
		Message:  fmt.Sprintf(format, a...),
	})
}

// Errf appends an error-severity finding.
func (c *Collector) Errf(file string, line int, rule, format string, a ...any) {
	c.add(Error, file, line, rule, format, a...)
}

// Warnf appends a warning-severity finding.
func (c *Collector) Warnf(file string, line int, rule, format string, a ...any) {
	c.add(Warning, file, line, rule, format, a...)
}

// Finalize dedupes (by full value) and stably sorts findings by file, line,
// rule, then message — guaranteeing byte-identical output for a given bundle.
func Finalize(items []Finding) []Finding {
	seen := map[Finding]bool{}
	out := make([]Finding, 0, len(items))
	for _, f := range items {
		if !seen[f] {
			seen[f] = true
			out = append(out, f)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		switch {
		case a.File != b.File:
			return a.File < b.File
		case a.Line != b.Line:
			return a.Line < b.Line
		case a.Rule != b.Rule:
			return a.Rule < b.Rule
		default:
			return a.Message < b.Message
		}
	})
	return out
}

// CountBySeverity returns the number of error and warning findings.
func CountBySeverity(items []Finding) (errors, warnings int) {
	for _, f := range items {
		switch f.Severity {
		case Error:
			errors++
		case Warning:
			warnings++
		}
	}
	return
}
