// Package site renders an OKF bundle's typed knowledge graph as a single,
// self-contained, offline HTML page: a requirements traceability tracker, a work
// board, a planning view, and a link graph. It is a deterministic projection of
// the same graph + findings the linter produces — no AI, no network, no new
// dependencies. Like the rest of the engine it hardcodes NO taxonomy: every
// classification (is-requirement / is-task-like / is-test), every status column,
// and every relationship name is computed here in Go from the runtime registry +
// ChainConfig and handed to the page as data, so the bundled JS never names a
// type or status. Point --types elsewhere and the site changes with zero code.
package site

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"io"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/graphx"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/types"
)

//go:embed template.html
var templateHTML string

// dataSentinel is replaced in the template with the marshalled view-model. It
// sits inside a <script type="application/json"> island; encoding/json escapes
// <, >, & by default, so the JSON cannot break out of the script tag.
const dataSentinel = "/*__IBUILD_DATA__*/"

// Render writes the static site for a bundle to w. The graph and findings are
// the linter's own deterministic output; reg supplies field/relationship specs
// for taxonomy-free classification. Output is byte-stable for a given bundle.
func Render(w io.Writer, g graphx.Graph, findings []model.Finding, cfg config.Config, reg *types.Registry) error {
	vm := build(g, findings, cfg, reg)
	data, err := json.Marshal(vm)
	if err != nil {
		return err
	}
	out := bytes.Replace([]byte(templateHTML), []byte(dataSentinel), data, 1)
	_, err = w.Write(out)
	return err
}

// --- view-model -------------------------------------------------------------

type vmChain struct {
	ImplementsRel   string   `json:"implementsRel"`
	VerifiesRel     string   `json:"verifiesRel"`
	VerifiedByRel   string   `json:"verifiedByRel"`
	ParentRel       string   `json:"parentRel"`
	CodeField       string   `json:"codeField"`
	PassingStatuses []string `json:"passingStatuses"`
}

type vmCap struct {
	Requirement bool `json:"requirement"`
	TaskLike    bool `json:"taskLike"`
	Test        bool `json:"test"`
}

type vmEdge struct {
	Rel        string `json:"rel"`
	To         string `json:"to,omitempty"`
	From       string `json:"from,omitempty"`
	TargetType string `json:"targetType,omitempty"`
	Resolved   bool   `json:"resolved"`
}

type vmFinding struct {
	Rule string `json:"rule"`
	Sev  string `json:"sev"`
	Msg  string `json:"msg"`
	Line int    `json:"line,omitempty"`
}

type vmNode struct {
	Key          string         `json:"key"`
	Path         string         `json:"path"`
	Type         string         `json:"type"`
	Status       string         `json:"status,omitempty"`
	Title        string         `json:"title"`
	Excerpt      string         `json:"excerpt,omitempty"`
	Fields       map[string]any `json:"fields,omitempty"`
	Cap          vmCap          `json:"cap"`
	Out          []vmEdge       `json:"out,omitempty"`
	In           []vmEdge       `json:"in,omitempty"`
	Findings     []vmFinding    `json:"findings,omitempty"`
	Implementers []string       `json:"implementers,omitempty"`
	Verifiers    []string       `json:"verifiers,omitempty"`
	Traced       bool           `json:"traced"`
}

type viewModel struct {
	Generator   string              `json:"generator"`
	Chain       vmChain             `json:"chain"`
	StatusOrder map[string][]string `json:"statusOrder"`
	Nodes       []vmNode            `json:"nodes"`
}

func build(g graphx.Graph, findings []model.Finding, cfg config.Config, reg *types.Registry) viewModel {
	ch := cfg.Chain
	reqType := reg.RelTarget(ch.ImplementsRel)

	// Capability predicates — the exact ones internal/validate/complete.go uses.
	isReq := func(t string) bool { return reqType != "" && reg.Satisfies(t, reqType) }
	hasField := func(t, name string) bool {
		if res, ok := reg.Resolve(t); ok {
			_, has := res.Fields[name]
			return has
		}
		return false
	}
	hasRel := func(t, name string) bool {
		if res, ok := reg.Resolve(t); ok {
			_, has := res.Rels[name]
			return has
		}
		return false
	}

	// Per-node incoming/outgoing edges. g.Edges is already Finalize-sorted, so
	// appending in order keeps the per-node slices deterministic.
	out := map[string][]vmEdge{}
	in := map[string][]vmEdge{}
	implementers := map[string][]string{}
	verifiers := map[string][]string{}
	for _, e := range g.Edges {
		out[e.From] = append(out[e.From], vmEdge{Rel: e.Relationship, To: e.To, TargetType: e.TargetType, Resolved: e.Resolved})
		in[e.To] = append(in[e.To], vmEdge{Rel: e.Relationship, From: e.From, TargetType: e.TargetType, Resolved: e.Resolved})
		if e.Resolved && e.Relationship == ch.ImplementsRel {
			implementers[e.To] = append(implementers[e.To], e.From)
		}
		if e.Resolved && e.Relationship == ch.VerifiesRel {
			verifiers[e.To] = append(verifiers[e.To], e.From)
		}
	}

	// Findings bucketed by file. Finding.File and Node.Path are both
	// bundle-relative, so the path is a direct join key.
	byFile := map[string][]vmFinding{}
	chainErr := map[string]bool{} // file -> has a chain.* error (drives "traced")
	for _, f := range findings {
		byFile[f.File] = append(byFile[f.File], vmFinding{Rule: f.Rule, Sev: string(f.Severity), Msg: f.Message, Line: f.Line})
		if f.Severity == model.Error && len(f.Rule) >= 6 && f.Rule[:6] == "chain." {
			chainErr[f.File] = true
		}
	}

	statusOrder := map[string][]string{}
	vm := viewModel{
		Generator: "iBuild site",
		Chain: vmChain{
			ImplementsRel: ch.ImplementsRel, VerifiesRel: ch.VerifiesRel,
			VerifiedByRel: ch.VerifiedByRel, ParentRel: ch.ParentRel, CodeField: ch.CodeField,
			PassingStatuses: ch.PassingStatuses,
		},
	}

	for _, n := range g.Nodes {
		vn := vmNode{
			Key: n.Key, Path: n.Path, Type: n.Type, Status: n.Status,
			Title:   title(n),
			Excerpt: n.Excerpt,
			Fields:  n.Fields,
			Cap: vmCap{
				Requirement: isReq(n.Type),
				TaskLike:    hasField(n.Type, ch.CodeField),
				Test:        hasRel(n.Type, ch.VerifiesRel),
			},
			Out:          out[n.Key],
			In:           in[n.Key],
			Findings:     byFile[n.Path],
			Implementers: implementers[n.Key],
			Verifiers:    verifiers[n.Key],
			Traced:       !chainErr[n.Path],
		}
		vm.Nodes = append(vm.Nodes, vn)

		// Status column order for the board: the type's declared one_of enum.
		if _, seen := statusOrder[n.Type]; !seen {
			if res, ok := reg.Resolve(n.Type); ok {
				if fs, ok := res.Fields["status"]; ok && len(fs.OneOf) > 0 {
					statusOrder[n.Type] = append([]string(nil), fs.OneOf...)
				}
			}
		}
	}
	vm.StatusOrder = statusOrder
	return vm
}

// title prefers the document's title, then its id, then its key — all generic
// frontmatter lookups, never a typed accessor.
func title(n graphx.Node) string {
	if t := strField(n.Fields, "title"); t != "" {
		return t
	}
	if id := strField(n.Fields, "id"); id != "" {
		return id
	}
	return n.Key
}

func strField(f map[string]any, key string) string {
	if f == nil {
		return ""
	}
	if v, ok := f[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
