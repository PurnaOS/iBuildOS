package types

import (
	"fmt"
	"regexp"
	"strings"
)

// compilePattern turns a dialect pattern into an anchored full-match regexp.
//
//	"regex:<raw>" -> the remainder used verbatim
//	otherwise     -> friendly tokens expanded; literal runs regexp-escaped
//
// Tokens: <number> -> [0-9]+ , <slug> -> [a-z0-9]+(?:-[a-z0-9]+)* , <date> -> \d{4}-\d{2}-\d{2}
// An unknown <token> is an error rather than a silently-literal match.
//
// NOTE: <date> is a SHAPE check only — it matches the YYYY-MM-DD digit shape but
// accepts impossible calendar dates like 2026-13-45. For real calendar validation
// use `type: date` (which parses and rejects out-of-range days/months); the two
// intentionally disagree.
//
// The result is always anchored to a full match via the \A(?:…)\z wrapper. For a
// raw "regex:" body we first compile the body standalone so an unbalanced group
// (e.g. "regex:a)b") is rejected as an invalid pattern instead of escaping the
// wrapper and silently producing a mis-anchored regexp.
func compilePattern(pattern string) (*regexp.Regexp, error) {
	var body string
	if rest, ok := strings.CutPrefix(pattern, "regex:"); ok {
		// Validate the raw body in isolation: a structurally-unbalanced body
		// (stray ')' / unclosed '(') would otherwise break out of our own
		// \A(?:…)\z wrapper and defeat the full-match guarantee. Compiling
		// "(?:" + body + ")" standalone surfaces that as an error here.
		if _, err := regexp.Compile("(?:" + rest + ")"); err != nil {
			return nil, err
		}
		body = rest
	} else {
		var b strings.Builder
		i := 0
		for i < len(pattern) {
			if pattern[i] == '<' {
				if end := strings.IndexByte(pattern[i:], '>'); end >= 0 {
					tok := pattern[i : i+end+1]
					switch tok {
					case "<number>":
						b.WriteString("[0-9]+")
					case "<slug>":
						b.WriteString("[a-z0-9]+(?:-[a-z0-9]+)*")
					case "<date>":
						b.WriteString(`\d{4}-\d{2}-\d{2}`)
					default:
						return nil, fmt.Errorf("unknown pattern token %q", tok)
					}
					i += end + 1
					continue
				}
			}
			if pattern[i] == '<' {
				b.WriteString(regexp.QuoteMeta("<")) // unmatched '<' (no '>'): emit literal, advance to avoid stalling
				i++
				continue
			}
			next := strings.IndexByte(pattern[i:], '<')
			if next < 0 {
				b.WriteString(regexp.QuoteMeta(pattern[i:]))
				break
			}
			b.WriteString(regexp.QuoteMeta(pattern[i : i+next]))
			i += next
		}
		body = b.String()
	}
	return regexp.Compile(`\A(?:` + body + `)\z`)
}
