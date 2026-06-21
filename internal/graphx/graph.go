// Package graphx is the public, JSON-tagged model of the artifact knowledge
// graph derived from an OKF bundle. It is what `iBuild graph` emits and what an
// AI agent reasons over — the requirements analog of a source-code graph
// (SCIP/LSIF). It hardcodes no taxonomy: a node carries `type` and `status` (the
// only two names the engine reads) plus a generic `fields` map of the remaining
// frontmatter, so an alternate type set yields a faithful graph with zero code
// change.
package graphx

import "sort"

// Graph is the whole export: the type schema, every artifact node, and every
// resolved typed edge. Output is deterministic after Finalize.
type Graph struct {
	Version   string        `json:"version"`
	Generator string        `json:"generator"`
	Types     []TypeSummary `json:"types"`
	Nodes     []Node        `json:"nodes"`
	Edges     []Edge        `json:"edges"`
}

// TypeSummary projects one ArtifactType from the registry so the agent
// understands the schema (abstract bases, what each relationship connects)
// without re-reading docs/types/.
type TypeSummary struct {
	Name          string       `json:"name"`
	Abstract      bool         `json:"abstract"`
	Extends       string       `json:"extends,omitempty"`
	Ancestors     []string     `json:"ancestors"`
	Relationships []RelSummary `json:"relationships"`
}

// RelSummary is a single relationship's declared shape.
type RelSummary struct {
	Name   string `json:"name"`
	Target string `json:"target"`
	Min    int    `json:"min"`
	Max    *int   `json:"max"` // nil = unbounded
}

// Node is one artifact. Key is the canonical /root-relative graph key; Path is
// the human-facing bundle-relative path. Fields holds every scalar/list
// frontmatter value except type/status/links.
type Node struct {
	Key       string         `json:"key"`
	Path      string         `json:"path"`
	Type      string         `json:"type"`
	KnownType bool           `json:"knownType"`
	Status    string         `json:"status,omitempty"`
	Fields    map[string]any `json:"fields,omitempty"`
	Excerpt   string         `json:"excerpt,omitempty"`
}

// Edge is one resolved typed link. Target is the declared expected type;
// TargetType is the actual type of the document pointed at. Unresolved (dangling
// or mistyped) links still appear with Resolved=false — OKF tolerance.
type Edge struct {
	From         string `json:"from"`
	To           string `json:"to"`
	Relationship string `json:"relationship"`
	Target       string `json:"target,omitempty"`
	TargetType   string `json:"targetType,omitempty"`
	Resolved     bool   `json:"resolved"`
}

// Options control the export.
type Options struct {
	Body  string   // "excerpt" (default) | "full" | "none"
	Node  string   // focus key (/root-relative); "" = whole graph
	Depth int      // neighborhood radius when Node is set
	Rels  []string // restrict edges/traversal to these relationship names; nil = all
}

// Finalize sorts and dedupes every collection so the JSON is byte-stable for a
// given bundle. (map[string]any Fields marshal with sorted keys by encoding/json
// — we never range a map for ordering ourselves.)
func (g *Graph) Finalize() {
	sort.Slice(g.Types, func(i, j int) bool { return g.Types[i].Name < g.Types[j].Name })
	for ti := range g.Types {
		rs := g.Types[ti].Relationships
		sort.Slice(rs, func(i, j int) bool { return rs[i].Name < rs[j].Name })
	}

	// Nodes: sort by Key, dedupe by Key.
	sort.Slice(g.Nodes, func(i, j int) bool { return g.Nodes[i].Key < g.Nodes[j].Key })
	seenNode := map[string]bool{}
	nodes := g.Nodes[:0]
	for _, n := range g.Nodes {
		if seenNode[n.Key] {
			continue
		}
		seenNode[n.Key] = true
		nodes = append(nodes, n)
	}
	g.Nodes = nodes

	// Edges: sort by (From, Relationship, To), dedupe full value (Edge is comparable).
	sort.Slice(g.Edges, func(i, j int) bool {
		a, b := g.Edges[i], g.Edges[j]
		switch {
		case a.From != b.From:
			return a.From < b.From
		case a.Relationship != b.Relationship:
			return a.Relationship < b.Relationship
		default:
			return a.To < b.To
		}
	})
	seenEdge := map[Edge]bool{}
	edges := g.Edges[:0]
	for _, e := range g.Edges {
		if seenEdge[e] {
			continue
		}
		seenEdge[e] = true
		edges = append(edges, e)
	}
	g.Edges = edges
}

// Focus returns the subgraph around a node: the node plus everything within
// depth hops (edges treated as undirected so neighbors include both a node's
// outgoing links and its incoming references). If rels is non-empty, only edges
// whose relationship is in rels are traversed and kept. The Types summary is
// preserved unchanged. A focus key with no node yields an empty node/edge set.
func Focus(g Graph, node string, depth int, rels []string) Graph {
	relSet := map[string]bool{}
	for _, r := range rels {
		relSet[r] = true
	}
	keep := func(rel string) bool { return len(relSet) == 0 || relSet[rel] }

	// Level-by-level BFS over kept edges, undirected. Expansion is gated on the
	// previous level's frontier (not the live reach set) so a node added at
	// depth d only expands at depth d+1 — otherwise edge ordering would let a
	// single pass cascade past the requested depth.
	reach := map[string]bool{node: true}
	frontier := map[string]bool{node: true}
	for d := 0; d < depth && len(frontier) > 0; d++ {
		next := map[string]bool{}
		for _, e := range g.Edges {
			if !keep(e.Relationship) {
				continue
			}
			if frontier[e.From] && !reach[e.To] {
				next[e.To] = true
			}
			if frontier[e.To] && !reach[e.From] {
				next[e.From] = true
			}
		}
		frontier = map[string]bool{}
		for k := range next {
			reach[k] = true
			frontier[k] = true
		}
	}

	out := Graph{Version: g.Version, Generator: g.Generator, Types: g.Types}
	for _, n := range g.Nodes {
		if reach[n.Key] {
			out.Nodes = append(out.Nodes, n)
		}
	}
	for _, e := range g.Edges {
		if keep(e.Relationship) && reach[e.From] && reach[e.To] {
			out.Edges = append(out.Edges, e)
		}
	}
	return out
}
