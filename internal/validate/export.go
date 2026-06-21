package validate

import (
	"strings"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/graphx"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/types"
	"gopkg.in/yaml.v3"
)

// reservedNodeFields are surfaced as first-class node attributes (or as the
// links block), so they are excluded from the generic fields map.
var reservedNodeFields = map[string]bool{"type": true, "status": true, "links": true}

// Graph builds the knowledge-graph export for a bundle. It reuses the exact
// discover→parse→resolve pipeline that Validate uses (link resolution included),
// discarding findings — graph is an export, not a gate. The result is
// Finalized (sorted, deduped) and therefore byte-stable for a given bundle.
func Graph(bundleDir string, cfg config.Config, opts graphx.Options) (graphx.Graph, error) {
	g, _, err := GraphWithRegistry(bundleDir, cfg, opts)
	return g, err
}

// GraphWithRegistry is Graph plus the compiled registry, so callers that need
// field-level classification (the site generator's status enums + code-field
// detection, which TypeSummary deliberately does not project) can reuse the
// already-loaded type model instead of reading docs/types/ a second time.
func GraphWithRegistry(bundleDir string, cfg config.Config, opts graphx.Options) (graphx.Graph, *types.Registry, error) {
	reg, arts, err := loadArtifacts(bundleDir, cfg, &model.Collector{})
	if err != nil {
		return graphx.Graph{}, nil, err
	}
	// Resolve every link (existence, target type) via the shared builder. The
	// throwaway collector swallows the validation findings.
	buildGraph(arts, reg, cfg, &model.Collector{})

	g := graphx.Graph{Version: "1", Generator: "iBuild graph"}
	g.Types = typeSummaries(reg)

	for _, a := range arts {
		n := graphx.Node{
			Key:       a.rootRel,
			Path:      a.path,
			Type:      a.typ,
			KnownType: a.typ != "" && reg.Has(a.typ),
			Status:    a.status,
			Fields:    genericFields(a),
		}
		if opts.Body != "none" && a.doc != nil {
			if opts.Body == "full" {
				n.Excerpt = strings.TrimSpace(a.doc.Body)
			} else {
				n.Excerpt = excerpt(a.doc.Body, 500)
			}
		}
		g.Nodes = append(g.Nodes, n)

		// Edges come from the resolved declared links. Undeclared-relationship
		// links are intentionally not part of the typed graph.
		var rels map[string]types.RelSpec
		if res, ok := reg.Resolve(a.typ); ok {
			rels = res.Rels
		}
		for relName, links := range a.links {
			target := ""
			if rels != nil {
				target = rels[relName].Target
			}
			for _, rl := range links {
				g.Edges = append(g.Edges, graphx.Edge{
					From:         a.rootRel,
					To:           rl.key,
					Relationship: relName,
					Target:       target,
					TargetType:   rl.targetType,
					Resolved:     rl.exists,
				})
			}
		}
	}

	g.Finalize()
	if opts.Node != "" {
		g = graphx.Focus(g, opts.Node, max(opts.Depth, 0), opts.Rels)
	}
	return g, reg, nil
}

func typeSummaries(reg *types.Registry) []graphx.TypeSummary {
	var out []graphx.TypeSummary
	for _, name := range reg.DefNames() {
		ts := graphx.TypeSummary{
			Name:      name,
			Abstract:  reg.IsAbstract(name),
			Extends:   reg.Extends(name),
			Ancestors: reg.Ancestors(name),
		}
		if res, ok := reg.Resolve(name); ok {
			for _, rn := range sortedKeys(res.Rels) {
				spec := res.Rels[rn]
				ts.Relationships = append(ts.Relationships, graphx.RelSummary{
					Name: rn, Target: spec.Target, Min: spec.Min, Max: spec.Max,
				})
			}
		}
		out = append(out, ts)
	}
	return out
}

// genericFields copies every scalar / scalar-list frontmatter value (except the
// reserved type/status/links) into a taxonomy-free map. Scalars become strings
// (raw source text); lists become []string. Anything else (nested mappings) is
// skipped. Returns nil when there is nothing to surface.
func genericFields(a *artifact) map[string]any {
	if a.doc == nil || a.doc.Map == nil {
		return nil
	}
	out := map[string]any{}
	for _, key := range a.doc.Keys() {
		if reservedNodeFields[key] {
			continue
		}
		_, vn, ok := a.doc.Get(key)
		if !ok {
			continue
		}
		switch vn.Kind {
		case yaml.ScalarNode:
			out[key] = vn.Value
		case yaml.SequenceNode:
			items := make([]string, 0, len(vn.Content))
			scalar := true
			for _, it := range vn.Content {
				if it.Kind != yaml.ScalarNode {
					scalar = false
					break
				}
				items = append(items, it.Value)
			}
			if scalar {
				out[key] = items
			}
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// excerpt returns a compact, prose-only summary of a body: the first non-empty
// paragraph, whitespace-collapsed, truncated to max runes on a rune boundary.
func excerpt(body string, max int) string {
	s := strings.TrimSpace(body)
	if s == "" {
		return ""
	}
	if idx := strings.Index(s, "\n\n"); idx >= 0 {
		s = s[:idx]
	}
	s = strings.Join(strings.Fields(s), " ")
	r := []rune(s)
	if len(r) > max {
		return strings.TrimSpace(string(r[:max])) + "…"
	}
	return s
}
