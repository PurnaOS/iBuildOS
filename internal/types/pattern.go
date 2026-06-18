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
func compilePattern(pattern string) (*regexp.Regexp, error) {
	var body string
	if rest, ok := strings.CutPrefix(pattern, "regex:"); ok {
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
