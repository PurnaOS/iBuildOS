package serve

import (
	"fmt"
	"strings"
)

// fmEditor is a minimal, deterministic, line-based YAML-frontmatter editor. It
// operates only on the leading `--- ... ---` block and preserves every other
// byte of the file (body, trailing newline, comments, ordering). It is NOT a
// general YAML editor — it understands exactly the two shapes simulate needs:
// top-level scalar keys (`key: value`) and the nested `links:` mapping of
// relationship -> inline or block sequence. That narrow scope is what keeps the
// edit mechanical and the post-state byte-identical to a hand commit.
type fmEditor struct {
	pre   []string // lines before the frontmatter (none, since the fence is line 0)
	fm    []string // frontmatter content lines (between the fences, exclusive)
	post  []string // body lines (after the closing fence)
	eol   string   // "\n" or "\r\n", inferred from the source
	final string   // trailing content after the last newline ("" if file ends in \n)
}

// newFMEditor splits raw into [pre][--- fm ---][post]. A file without a leading
// frontmatter fence is rejected — every artifact simulate touches has one.
func newFMEditor(raw []byte) (*fmEditor, error) {
	s := string(raw)
	eol := "\n"
	if strings.Contains(s, "\r\n") {
		eol = "\r\n"
	}
	// Normalize to \n for processing; remember the trailing fragment so a file
	// without a final newline round-trips exactly.
	norm := strings.ReplaceAll(s, "\r\n", "\n")
	lines := strings.Split(norm, "\n")
	final := ""
	if len(lines) > 0 {
		// The last element after Split is the text after the final "\n"
		// (empty when the file ends in a newline).
		final = lines[len(lines)-1]
		lines = lines[:len(lines)-1]
	}
	if len(lines) == 0 || strings.TrimRight(lines[0], " \t") != "---" {
		return nil, fmt.Errorf("file has no YAML frontmatter fence to edit")
	}
	closeIdx := -1
	for i := 1; i < len(lines); i++ {
		if strings.TrimRight(lines[i], " \t") == "---" {
			closeIdx = i
			break
		}
	}
	if closeIdx < 0 {
		return nil, fmt.Errorf("frontmatter fence is never closed")
	}
	return &fmEditor{
		pre:   []string{lines[0]},
		fm:    append([]string(nil), lines[1:closeIdx]...),
		post:  append([]string(nil), lines[closeIdx:]...),
		eol:   eol,
		final: final,
	}, nil
}

// bytes reassembles the file with the same EOL style and trailing fragment.
func (e *fmEditor) bytes() []byte {
	all := make([]string, 0, len(e.pre)+len(e.fm)+len(e.post))
	all = append(all, e.pre...)
	all = append(all, e.fm...)
	all = append(all, e.post...)
	joined := strings.Join(all, "\n")
	if joined != "" {
		joined += "\n"
	}
	joined += e.final
	if e.eol == "\r\n" {
		joined = strings.ReplaceAll(joined, "\n", "\r\n")
	}
	return []byte(joined)
}

// setScalar replaces a top-level scalar key's value, or appends `key: value` to
// the end of the frontmatter if the key is absent. Quoting follows the source:
// if the existing value was quoted we keep the same quote style; a new value is
// quoted only when it needs it (so plain identifiers stay unquoted, matching how
// the bundle is normally hand-written).
func (e *fmEditor) setScalar(key, value string) {
	idx := e.topLevelKeyLine(key)
	if idx < 0 {
		e.fm = append(e.fm, fmt.Sprintf("%s: %s", key, yamlScalar(value)))
		return
	}
	indent := leadingWS(e.fm[idx])
	e.fm[idx] = fmt.Sprintf("%s%s: %s", indent, key, yamlScalar(value))
}

// addLink inserts `to` into the `rel` sequence under the top-level `links:`
// mapping, creating `links:` and/or the relationship sequence as needed. The
// emitted shape matches the bundle's hand-written style: a block mapping under
// `links:` with each relationship an inline `[a, b]` list. If the relationship
// already lists `to`, it is left unchanged (idempotent).
func (e *fmEditor) addLink(rel, to string) {
	linksIdx := e.topLevelKeyLine("links")
	if linksIdx < 0 {
		// No links block at all: append one with this single relationship.
		e.fm = append(e.fm,
			"links:",
			fmt.Sprintf("  %s: [%s]", rel, to),
		)
		return
	}

	// Find the relationship line within the links block. The block runs from the
	// line after `links:` until the next line at the links: indent or shallower.
	linksIndent := len(leadingWS(e.fm[linksIdx]))
	childIndent := -1
	relIdx := -1
	end := len(e.fm)
	for i := linksIdx + 1; i < len(e.fm); i++ {
		line := e.fm[i]
		if strings.TrimSpace(line) == "" {
			continue
		}
		ind := len(leadingWS(line))
		if ind <= linksIndent {
			end = i
			break
		}
		if childIndent < 0 {
			childIndent = ind
		}
		if ind == childIndent {
			if k := topKeyOf(line); k == rel {
				relIdx = i
			}
		}
	}
	if childIndent < 0 {
		childIndent = linksIndent + 2
	}
	indent := strings.Repeat(" ", childIndent)

	if relIdx < 0 {
		// Relationship absent: insert a new inline-sequence line at the end of
		// the links block (preserving everything after it, e.g. the body fence).
		newLine := fmt.Sprintf("%s%s: [%s]", indent, rel, to)
		e.fm = insertLine(e.fm, end, newLine)
		return
	}

	// Relationship present: append `to` to its sequence (inline or block).
	e.appendToSequence(relIdx, childIndent, to)
}

// appendToSequence adds `to` to the relationship sequence starting at relIdx.
// Handles both inline (`rel: [a, b]`) and block (`rel:` then `  - a`) forms.
func (e *fmEditor) appendToSequence(relIdx, relIndent int, to string) {
	line := e.fm[relIdx]
	_, valuePart := splitKeyValue(line)
	trimmed := strings.TrimSpace(valuePart)

	// A block sequence follows when the inline value is empty AND the next
	// non-blank line(s) under this rel are `- item` entries. Scan for it first so
	// `rel:\n  - a` is extended in place rather than rewritten as inline.
	itemIndent := -1
	insertAt := relIdx + 1
	for i := relIdx + 1; i < len(e.fm); i++ {
		l := e.fm[i]
		if strings.TrimSpace(l) == "" {
			continue
		}
		if len(leadingWS(l)) <= relIndent {
			break
		}
		if strings.HasPrefix(strings.TrimSpace(l), "-") {
			if itemIndent < 0 {
				itemIndent = len(leadingWS(l))
			}
			if v := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(l), "-")); v == to {
				return // idempotent
			}
			insertAt = i + 1
		}
	}

	switch {
	case itemIndent >= 0:
		// Block sequence: append a `- to` item at the existing item indentation.
		newItem := fmt.Sprintf("%s- %s", strings.Repeat(" ", itemIndent), to)
		e.fm = insertLine(e.fm, insertAt, newItem)
	case strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]"):
		inner := strings.TrimSpace(trimmed[1 : len(trimmed)-1])
		items := splitInlineItems(inner)
		for _, it := range items {
			if it == to {
				return // idempotent
			}
		}
		items = append(items, to)
		indent := strings.Repeat(" ", relIndent)
		e.fm[relIdx] = fmt.Sprintf("%s%s: [%s]", indent, topKeyOf(line), strings.Join(items, ", "))
	case trimmed == "":
		// empty value, no block items -> single-item inline list
		indent := strings.Repeat(" ", relIndent)
		e.fm[relIdx] = fmt.Sprintf("%s%s: [%s]", indent, topKeyOf(line), to)
	default:
		// scalar value, not a list: convert to inline two-item list
		indent := strings.Repeat(" ", relIndent)
		e.fm[relIdx] = fmt.Sprintf("%s%s: [%s, %s]", indent, topKeyOf(line), trimmed, to)
	}
}

// topLevelKeyLine returns the fm index of a top-level (zero-indent) `key:` line,
// or -1. "Top-level" means indentation 0 within the frontmatter block.
func (e *fmEditor) topLevelKeyLine(key string) int {
	for i, line := range e.fm {
		if len(leadingWS(line)) != 0 {
			continue
		}
		if topKeyOf(line) == key {
			return i
		}
	}
	return -1
}

// --- small string helpers (no regexp; deterministic) ------------------------

func leadingWS(s string) string {
	i := 0
	for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
		i++
	}
	return s[:i]
}

// topKeyOf returns the YAML key at the start of a line (before the first ':'),
// trimmed of indentation, or "" if the line is not a `key:` line.
func topKeyOf(line string) string {
	t := strings.TrimLeft(line, " \t")
	if strings.HasPrefix(t, "#") || strings.HasPrefix(t, "-") {
		return ""
	}
	idx := strings.IndexByte(t, ':')
	if idx < 0 {
		return ""
	}
	return strings.TrimSpace(t[:idx])
}

// splitKeyValue splits a `key: value` line into key and the raw value portion
// (everything after the first colon, leading space preserved-ish via trim).
func splitKeyValue(line string) (key, value string) {
	t := strings.TrimLeft(line, " \t")
	idx := strings.IndexByte(t, ':')
	if idx < 0 {
		return strings.TrimSpace(t), ""
	}
	return strings.TrimSpace(t[:idx]), t[idx+1:]
}

// splitInlineItems splits the inside of an inline flow sequence `a, b, c` into
// trimmed items, dropping empties. Targets are bare paths with no commas, so a
// simple comma split is sufficient and deterministic.
func splitInlineItems(inner string) []string {
	if strings.TrimSpace(inner) == "" {
		return nil
	}
	var out []string
	for _, p := range strings.Split(inner, ",") {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func insertLine(lines []string, at int, line string) []string {
	if at < 0 {
		at = 0
	}
	if at > len(lines) {
		at = len(lines)
	}
	out := make([]string, 0, len(lines)+1)
	out = append(out, lines[:at]...)
	out = append(out, line)
	out = append(out, lines[at:]...)
	return out
}

// yamlScalar quotes a scalar value only if it could be misread as something
// other than a plain string (so identifiers like `done`/`alice` stay unquoted,
// matching the hand-written bundle). Empty or special-character values are
// double-quoted.
func yamlScalar(v string) string {
	if v == "" {
		return `""`
	}
	if needsQuote(v) {
		return `"` + strings.ReplaceAll(v, `"`, `\"`) + `"`
	}
	return v
}

func needsQuote(v string) bool {
	// Leading/trailing space, or any of the YAML indicator characters that would
	// change parsing, force quoting.
	if v != strings.TrimSpace(v) {
		return true
	}
	switch v {
	case "true", "false", "null", "yes", "no", "~":
		return true
	}
	for _, r := range v {
		switch r {
		case ':', '#', '{', '}', '[', ']', ',', '&', '*', '!', '|', '>', '\'', '"', '%', '@', '`':
			return true
		}
	}
	// A purely numeric value would be read as a number; quote to keep it a string.
	allDigits := true
	for _, r := range v {
		if r < '0' || r > '9' {
			allDigits = false
			break
		}
	}
	return allDigits
}
