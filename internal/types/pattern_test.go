package types

import "testing"

func TestCompilePattern(t *testing.T) {
	tests := []struct {
		pattern string
		value   string
		match   bool
		wantErr bool
	}{
		{"TASK-<number>", "TASK-014", true, false},
		{"TASK-<number>", "TASK-x", false, false},
		{"TASK-<number>", "xTASK-1", false, false}, // anchored
		{"TASK-<number>", "TASK-1 ", false, false}, // anchored, no trailing
		{"FR-<number>", "FR-0007", true, false},
		{"TEST-<slug>", "TEST-orders-freshness", true, false},
		{"TEST-<slug>", "TEST-Orders", false, false}, // slug is lowercase
		{"<date>", "2026-06-18", true, false},
		{"<date>", "2026-6-18", false, false},
		{"regex:^v[0-9]+$", "v12", true, false},
		{"a.b-<number>", "a.b-3", true, false},  // literal dot escaped
		{"a.b-<number>", "axb-3", false, false}, // dot is literal, not any-char
		{"<bogus>", "x", false, true},
	}
	for _, tt := range tests {
		re, err := compilePattern(tt.pattern)
		if (err != nil) != tt.wantErr {
			t.Errorf("compilePattern(%q) err = %v, wantErr %v", tt.pattern, err, tt.wantErr)
			continue
		}
		if tt.wantErr {
			continue
		}
		if got := re.MatchString(tt.value); got != tt.match {
			t.Errorf("compilePattern(%q).Match(%q) = %v, want %v", tt.pattern, tt.value, got, tt.match)
		}
	}
}
