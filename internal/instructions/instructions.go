// Package instructions renders an authoring template for an artifact type,
// derived entirely from the type registry (docs/types/*.md). It is a read-only
// projection — the deterministic-core analog of `graph`, with no findings, no
// AI, and no taxonomy literal: the type name is an argument, never a comparison.
// The AI skills call it instead of hardcoding field knowledge, which is how the
// engine serves the AI layer without the AI layer leaking into the engine.
package instructions

import (
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"text/tabwriter"

	"github.com/PurnaOS/iBuildOS/internal/types"
)

// fieldOut / relOut / typeOut are the stable JSON projection.
type fieldOut struct {
	Name     string   `json:"name"`
	Required bool     `json:"required"`
	Type     string   `json:"type,omitempty"`
	OneOf    []string `json:"one_of,omitempty"`
	Pattern  string   `json:"pattern,omitempty"`
	Doc      string   `json:"doc,omitempty"`
}

type relOut struct {
	Name   string `json:"name"`
	Target string `json:"target"`
	Min    int    `json:"min"`
	Max    *int   `json:"max,omitempty"`
	Doc    string `json:"doc,omitempty"`
}

type typeOut struct {
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	Extends     string     `json:"extends,omitempty"`
	Abstract    bool       `json:"abstract"`
	Fields      []fieldOut `json:"fields"`
	Links       []relOut   `json:"links"`
}

// Write renders instructions for typeName (or, when typeName is "", the list of
// all defined types) in the given format ("text" or "json"). An unknown type is
// an error so the CLI can exit non-zero.
func Write(w io.Writer, reg *types.Registry, typeName, format string) error {
	if typeName == "" {
		if format == "json" {
			return writeListJSON(w, reg)
		}
		return writeList(w, reg)
	}
	if !reg.Has(typeName) {
		return fmt.Errorf("unknown type %q (run `iBuild instructions` to list defined types)", typeName)
	}
	out := project(reg, typeName)
	if format == "json" {
		return writeJSON(w, out)
	}
	return writeText(w, reg, out)
}

// project flattens a type into its stable, sorted JSON shape.
func project(reg *types.Registry, name string) typeOut {
	res, _ := reg.Resolve(name)
	out := typeOut{
		Name:        name,
		Description: reg.Description(name),
		Extends:     reg.Extends(name),
		Abstract:    reg.IsAbstract(name),
	}
	for _, fn := range sortedKeys(res.Fields) {
		f := res.Fields[fn]
		out.Fields = append(out.Fields, fieldOut{
			Name: fn, Required: f.Required, Type: f.Type,
			OneOf: f.OneOf, Pattern: f.Pattern, Doc: f.Doc,
		})
	}
	for _, rn := range sortedRelKeys(res.Rels) {
		r := res.Rels[rn]
		out.Links = append(out.Links, relOut{
			Name: rn, Target: r.Target, Min: r.Min, Max: r.Max, Doc: r.Doc,
		})
	}
	return out
}

func writeJSON(w io.Writer, out typeOut) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(out)
}

func writeText(w io.Writer, reg *types.Registry, out typeOut) error {
	var b strings.Builder
	fmt.Fprintf(&b, "%s", out.Name)
	if out.Description != "" {
		fmt.Fprintf(&b, " — %s", out.Description)
	}
	b.WriteByte('\n')
	if out.Extends != "" {
		fmt.Fprintf(&b, "extends %s\n", out.Extends)
	}
	if out.Abstract {
		subs := reg.ConcreteSubtypes(out.Name)
		fmt.Fprintf(&b, "\nABSTRACT — cannot be authored directly. Use one of: %s\n",
			strings.Join(subs, ", "))
	}

	// Fields table.
	b.WriteString("\nFields:\n")
	tw := tabwriter.NewWriter(&b, 0, 2, 2, ' ', 0)
	for _, f := range out.Fields {
		req := ""
		if f.Required {
			req = "required"
		}
		fmt.Fprintf(tw, "  %s\t%s\t%s\t%s\n", f.Name, req, fieldHint(f), f.Doc)
	}
	tw.Flush()

	// Links table.
	if len(out.Links) > 0 {
		b.WriteString("\nLinks:\n")
		tw = tabwriter.NewWriter(&b, 0, 2, 2, ' ', 0)
		for _, r := range out.Links {
			fmt.Fprintf(tw, "  %s\t→ %s\t%s\t%s\n", r.Name, r.Target, cardinality(r.Min, r.Max), r.Doc)
		}
		tw.Flush()
	}

	// Copy-paste template (concrete types only).
	if !out.Abstract {
		b.WriteString("\nTemplate:\n")
		b.WriteString(template(out))
	}
	_, err := io.WriteString(w, b.String())
	return err
}

// template builds a fill-in-the-blank frontmatter skeleton.
func template(out typeOut) string {
	var b strings.Builder
	b.WriteString("  ---\n")
	fmt.Fprintf(&b, "  type: %s\n", out.Name)
	for _, f := range out.Fields {
		fmt.Fprintf(&b, "  %s:%s\n", f.Name, fieldDefault(f))
	}
	if len(out.Links) > 0 {
		b.WriteString("  links:\n")
		for _, r := range out.Links {
			fmt.Fprintf(&b, "    %s: []%s\n", r.Name, "  # → "+r.Target+" "+cardinality(r.Min, r.Max))
		}
	}
	b.WriteString("  ---\n")
	return b.String()
}

// fieldDefault seeds a frontmatter value: enums default to their first option,
// patterns leave a hint comment, everything else is blank to fill in.
func fieldDefault(f fieldOut) string {
	if len(f.OneOf) > 0 {
		return " " + f.OneOf[0] + "   # one of: " + strings.Join(f.OneOf, " | ")
	}
	if f.Pattern != "" {
		return "   # " + f.Pattern
	}
	if f.Type == "list" {
		return " []"
	}
	return ""
}

func fieldHint(f fieldOut) string {
	switch {
	case len(f.OneOf) > 0:
		return "one of: " + strings.Join(f.OneOf, " | ")
	case f.Pattern != "":
		return "pattern " + f.Pattern
	case f.Type != "" && f.Type != "string":
		return f.Type
	default:
		return ""
	}
}

func cardinality(min int, max *int) string {
	hi := "*"
	if max != nil {
		hi = fmt.Sprintf("%d", *max)
	}
	return fmt.Sprintf("(%d..%s)", min, hi)
}

func writeList(w io.Writer, reg *types.Registry) error {
	var b strings.Builder
	b.WriteString("Defined artifact types (run `iBuild instructions <Type>` for one):\n\n")
	tw := tabwriter.NewWriter(&b, 0, 2, 2, ' ', 0)
	for _, name := range reg.DefNames() {
		marker := ""
		if reg.IsAbstract(name) {
			marker = "(abstract)"
		}
		fmt.Fprintf(tw, "  %s\t%s\t%s\n", name, marker, reg.Description(name))
	}
	tw.Flush()
	_, err := io.WriteString(w, b.String())
	return err
}

func writeListJSON(w io.Writer, reg *types.Registry) error {
	var list []typeOut
	for _, name := range reg.DefNames() {
		list = append(list, typeOut{
			Name: name, Description: reg.Description(name),
			Extends: reg.Extends(name), Abstract: reg.IsAbstract(name),
		})
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(list)
}

func sortedKeys(m map[string]types.FieldSpec) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func sortedRelKeys(m map[string]types.RelSpec) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
