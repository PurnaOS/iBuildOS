package types

import "testing"

// TestCompilePatternRejectsUnbalancedRegex confirms that a raw "regex:" body with
// unbalanced parens cannot escape the engine's own \A(?:…)\z wrapper. Before this
// fix "regex:a)b" compiled to `\A(?:a)b)\z`, which is a VALID regexp but anchors
// only "a" inside the group — defeating the full-match guarantee. We now compile
// the body standalone first and surface the imbalance as an error.
func TestCompilePatternRejectsUnbalancedRegex(t *testing.T) {
	if _, err := compilePattern("regex:a)b"); err == nil {
		t.Fatalf(`compilePattern("regex:a)b") = nil error, want invalid-pattern error`)
	}

	// Sanity: the same imbalance the other way (unclosed group) is also rejected.
	if _, err := compilePattern("regex:a(b"); err == nil {
		t.Fatalf(`compilePattern("regex:a(b") = nil error, want invalid-pattern error`)
	}
}

// TestCompilePatternValidRegexAnchors confirms valid bodies (including alternation
// and groups) still compile AND stay full-match-anchored — the alternation must
// not leak past the wrapper.
func TestCompilePatternValidRegexAnchors(t *testing.T) {
	cases := []struct {
		pattern string
		value   string
		match   bool
	}{
		// Alternation: with proper wrapping, both whole alternatives match but a
		// superstring does not (proving the \z anchor binds the alternation).
		{"regex:a|b", "a", true},
		{"regex:a|b", "b", true},
		{"regex:a|b", "ab", false},
		{"regex:a|b", "ba", false},
		{"regex:a|b", "xa", false},
		// Grouped + quantified.
		{"regex:(x|y)+", "xyx", true},
		{"regex:(x|y)+", "", false},
		{"regex:(x|y)+", "xz", false},
	}
	for _, tt := range cases {
		re, err := compilePattern(tt.pattern)
		if err != nil {
			t.Fatalf("compilePattern(%q) unexpected err: %v", tt.pattern, err)
		}
		if got := re.MatchString(tt.value); got != tt.match {
			t.Errorf("compilePattern(%q).Match(%q) = %v, want %v", tt.pattern, tt.value, got, tt.match)
		}
	}
}

// TestCompilePatternTokensStillAnchor confirms the friendly-token path (unchanged
// by this fix) still expands and full-match-anchors <date>, <slug>, <number>.
func TestCompilePatternTokensStillAnchor(t *testing.T) {
	cases := []struct {
		pattern string
		value   string
		match   bool
	}{
		// <date> is shape-only: a well-shaped date matches...
		{"<date>", "2026-06-21", true},
		// ...and an impossible calendar date ALSO matches (documented shape-only
		// behavior — type: date is what calendar-validates).
		{"<date>", "2026-13-45", true},
		{"<date>", "2026-6-21", false}, // wrong shape (single-digit month)
		{"<date>", "x2026-06-21", false},
		{"<slug>", "orders-freshness", true},
		{"<slug>", "Orders", false}, // slug is lowercase
		{"<number>", "0142", true},
		{"<number>", "14x", false}, // anchored, no trailing
		{"REQ-<number>", "REQ-7", true},
	}
	for _, tt := range cases {
		re, err := compilePattern(tt.pattern)
		if err != nil {
			t.Fatalf("compilePattern(%q) unexpected err: %v", tt.pattern, err)
		}
		if got := re.MatchString(tt.value); got != tt.match {
			t.Errorf("compilePattern(%q).Match(%q) = %v, want %v", tt.pattern, tt.value, got, tt.match)
		}
	}
}
