package graphx

import (
	"bytes"
	"testing"
)

func sampleGraph() Graph {
	return Graph{
		Version:   "1",
		Generator: "iBuild graph",
		Nodes: []Node{
			{Key: "/b.md", Path: "docs/b.md", Type: "Task"},
			{Key: "/a.md", Path: "docs/a.md", Type: "FunctionalRequirement"},
			{Key: "/a.md", Path: "docs/a.md", Type: "FunctionalRequirement"}, // dup
			{Key: "/c.md", Path: "docs/c.md", Type: "Test"},
		},
		Edges: []Edge{
			{From: "/b.md", To: "/c.md", Relationship: "verified_by", Resolved: true},
			{From: "/b.md", To: "/a.md", Relationship: "implements", Resolved: true},
			{From: "/b.md", To: "/a.md", Relationship: "implements", Resolved: true}, // dup
		},
	}
}

func TestFinalizeDeterministicAndDeduped(t *testing.T) {
	g := sampleGraph()
	g.Finalize()

	if len(g.Nodes) != 3 {
		t.Fatalf("node dedupe failed: got %d, want 3", len(g.Nodes))
	}
	if len(g.Edges) != 2 {
		t.Fatalf("edge dedupe failed: got %d, want 2", len(g.Edges))
	}
	if g.Nodes[0].Key != "/a.md" || g.Nodes[1].Key != "/b.md" || g.Nodes[2].Key != "/c.md" {
		t.Errorf("nodes not sorted by key: %v", []string{g.Nodes[0].Key, g.Nodes[1].Key, g.Nodes[2].Key})
	}
	// edges sort by (from, relationship, to): implements before verified_by
	if g.Edges[0].Relationship != "implements" || g.Edges[1].Relationship != "verified_by" {
		t.Errorf("edges not sorted by relationship: %v", g.Edges)
	}

	var a, b bytes.Buffer
	if err := JSON(&a, g); err != nil {
		t.Fatal(err)
	}
	if err := JSON(&b, g); err != nil {
		t.Fatal(err)
	}
	if a.String() != b.String() {
		t.Fatal("graph JSON is not deterministic")
	}
}

func TestJSONEmptyCollections(t *testing.T) {
	var buf bytes.Buffer
	if err := JSON(&buf, Graph{Version: "1"}); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	for _, want := range []string{`"nodes": []`, `"edges": []`, `"types": []`} {
		if !bytes.Contains([]byte(out), []byte(want)) {
			t.Errorf("empty graph should render %s: %s", want, out)
		}
	}
}

func TestFocusDepthRespectsLevels(t *testing.T) {
	// chain: a <-implements- b -parent-> s <-parent- b2
	g := Graph{
		Version: "1",
		Nodes: []Node{
			{Key: "/a.md"}, {Key: "/b.md"}, {Key: "/s.md"}, {Key: "/b2.md"},
		},
		Edges: []Edge{
			{From: "/b.md", To: "/a.md", Relationship: "implements"},
			{From: "/b.md", To: "/s.md", Relationship: "parent"},
			{From: "/b2.md", To: "/s.md", Relationship: "parent"},
		},
	}
	g.Finalize()

	d1 := Focus(g, "/b.md", 1, nil)
	got := keys(d1.Nodes)
	// depth 1 from b: a, s, b — NOT b2 (which is 2 hops away via s)
	if len(got) != 3 || !has(got, "/a.md") || !has(got, "/s.md") || !has(got, "/b.md") || has(got, "/b2.md") {
		t.Fatalf("depth 1 neighborhood wrong: %v", got)
	}

	d2 := Focus(g, "/b.md", 2, nil)
	if !has(keys(d2.Nodes), "/b2.md") {
		t.Errorf("depth 2 should reach /b2.md: %v", keys(d2.Nodes))
	}

	// relationship filter: only traverse implements -> just a and b
	rel := Focus(g, "/b.md", 2, []string{"implements"})
	if got := keys(rel.Nodes); len(got) != 2 || !has(got, "/a.md") || has(got, "/s.md") {
		t.Errorf("rel filter wrong: %v", got)
	}
}

func keys(ns []Node) []string {
	out := make([]string, len(ns))
	for i, n := range ns {
		out[i] = n.Key
	}
	return out
}

func has(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}
