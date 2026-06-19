// Package okf is the OKF substrate: a hand-written frontmatter splitter and
// glob matching. It knows nothing about the SDLC type taxonomy — it only deals
// with markdown + YAML frontmatter and bundle file discovery.
package okf

import (
	"errors"
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

// ErrUnterminated is returned when a file opens a `---` fence but never closes it.
var ErrUnterminated = errors.New("frontmatter: opening --- without a closing fence")

// Document is a parsed OKF concept: its frontmatter mapping plus body.
type Document struct {
	Path           string
	HasFrontmatter bool
	Map            *yaml.Node // the frontmatter mapping node, nil when HasFrontmatter is false
	Body           string
	frontStart     int // 1-based file line of the first frontmatter content line
}

// LinkRef is one typed link target as written, with its source line.
type LinkRef struct {
	Raw  string
	Line int
}

// Split separates a leading `--- ... ---` YAML frontmatter block from the body.
// The opening fence must be the very first line (after an optional BOM). The
// closing fence is the next line that is exactly `---`. Returns ok=false (no
// error) when there is no opening fence, and ErrUnterminated when the opener has
// no closer.
func Split(raw []byte) (front []byte, body string, frontStartLine int, ok bool, err error) {
	s := strings.TrimPrefix(string(raw), "\ufeff") // strip UTF-8 BOM if present
	lines := strings.Split(s, "\n")
	if len(lines) == 0 || strings.TrimRight(lines[0], " \t\r") != "---" {
		return nil, s, 0, false, nil
	}
	for i := 1; i < len(lines); i++ {
		if strings.TrimRight(lines[i], " \t\r") == "---" {
			return []byte(strings.Join(lines[1:i], "\n")), strings.Join(lines[i+1:], "\n"), 2, true, nil
		}
	}
	return nil, s, 0, false, ErrUnterminated
}

// Parse splits and YAML-decodes a file. A document with no frontmatter is not an
// error (HasFrontmatter is false) — this is how reserved/prose files are tolerated.
func Parse(path string, raw []byte) (*Document, error) {
	front, body, start, ok, err := Split(raw)
	d := &Document{Path: path, Body: body, frontStart: start}
	if err != nil {
		return d, err
	}
	if !ok {
		return d, nil
	}
	d.HasFrontmatter = true
	var doc yaml.Node
	if e := yaml.Unmarshal(front, &doc); e != nil {
		return d, fmt.Errorf("frontmatter: %w", e)
	}
	switch {
	case len(doc.Content) == 0:
		d.Map = &yaml.Node{Kind: yaml.MappingNode} // empty frontmatter -> empty mapping
	case doc.Content[0].Kind == yaml.MappingNode:
		d.Map = doc.Content[0]
	default:
		return d, fmt.Errorf("frontmatter: expected a mapping, got %s", kindName(doc.Content[0].Kind))
	}
	return d, nil
}

// Line maps a YAML node (numbered relative to the frontmatter block) to a
// 1-based line in the original file. Returns 0 for a nil node.
func (d *Document) Line(n *yaml.Node) int {
	if n == nil || d.frontStart == 0 {
		return 0
	}
	return n.Line + d.frontStart - 1
}

// FrontStartLine is the file line of the first frontmatter content line (2 for a
// well-formed file), used as the fallback location for "missing key" findings.
func (d *Document) FrontStartLine() int { return d.frontStart }

// Get returns the key and value nodes for a top-level frontmatter key.
func (d *Document) Get(key string) (keyNode, valNode *yaml.Node, ok bool) {
	if d.Map == nil {
		return nil, nil, false
	}
	for i := 0; i+1 < len(d.Map.Content); i += 2 {
		if d.Map.Content[i].Value == key {
			return d.Map.Content[i], d.Map.Content[i+1], true
		}
	}
	return nil, nil, false
}

// Keys returns the top-level frontmatter keys in document order.
func (d *Document) Keys() []string {
	var out []string
	if d.Map != nil {
		for i := 0; i+1 < len(d.Map.Content); i += 2 {
			out = append(out, d.Map.Content[i].Value)
		}
	}
	return out
}

// Links reads the `links:` block: a mapping of relationship name to a list of
// (or single) root-relative path targets, each carrying its source line.
func (d *Document) Links() map[string][]LinkRef {
	res := map[string][]LinkRef{}
	_, lv, ok := d.Get("links")
	if !ok || lv.Kind != yaml.MappingNode {
		return res
	}
	for i := 0; i+1 < len(lv.Content); i += 2 {
		rel := lv.Content[i].Value
		val := lv.Content[i+1]
		var refs []LinkRef
		switch val.Kind {
		case yaml.SequenceNode:
			for _, item := range val.Content {
				refs = append(refs, LinkRef{Raw: item.Value, Line: d.Line(item)})
			}
		case yaml.ScalarNode:
			if val.Value != "" {
				refs = append(refs, LinkRef{Raw: val.Value, Line: d.Line(val)})
			}
		}
		res[rel] = refs
	}
	return res
}

func kindName(k yaml.Kind) string {
	switch k {
	case yaml.SequenceNode:
		return "list"
	case yaml.ScalarNode:
		return "scalar"
	case yaml.MappingNode:
		return "mapping"
	default:
		return "value"
	}
}
