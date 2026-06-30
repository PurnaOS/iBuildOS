package graphx

import "testing"

// TestFocusDanglingTargetIsNotAHub verifies that a dangling (non-node) link
// target cannot act as a BFS traversal hub. Graph:
//
//	A (real) --references--> X (dangling, NOT a node)
//	X        --references--> B (real)            // X is the `from` here
//
// X is referenced by two edges but has no Node entry. Focusing on A at depth 2
// must reach neither X nor B through X: A's edge to X is kept (so the unresolved
// link stays visible) but X is never expanded, so B is NOT pulled in.
func TestFocusDanglingTargetIsNotAHub(t *testing.T) {
	g := Graph{
		Version: "1",
		Nodes: []Node{
			{Key: "/a.md", Type: "Task"},
			{Key: "/b.md", Type: "Task"},
			// NB: no node for "/x.md" — it is a dangling target.
		},
		Edges: []Edge{
			{From: "/a.md", To: "/x.md", Relationship: "references", Resolved: false},
			{From: "/x.md", To: "/b.md", Relationship: "references", Resolved: false},
		},
	}
	g.Finalize()

	got := Focus(g, "/a.md", 2, nil)

	nk := keys(got.Nodes)
	if !has(nk, "/a.md") {
		t.Fatalf("focus must include the focus node: %v", nk)
	}
	if has(nk, "/b.md") {
		t.Fatalf("B must NOT be pulled in through dangling X at depth 2: %v", nk)
	}
	// X is not a node, so it can never appear in Nodes regardless.
	if has(nk, "/x.md") {
		t.Fatalf("dangling X must not appear as a node: %v", nk)
	}
	if len(nk) != 1 {
		t.Fatalf("only A should be reached, got %v", nk)
	}

	// The A->X edge stays visible (unresolved link from a reached node), but the
	// X->B edge must be dropped (X is not reached, B not pulled in).
	var sawAX, sawXB bool
	for _, e := range got.Edges {
		if e.From == "/a.md" && e.To == "/x.md" {
			sawAX = true
		}
		if e.From == "/x.md" && e.To == "/b.md" {
			sawXB = true
		}
	}
	if !sawAX {
		t.Errorf("A->X dangling edge should be KEPT (visible) but was dropped: %v", got.Edges)
	}
	if sawXB {
		t.Errorf("X->B edge should NOT be kept (X is not a reached hub): %v", got.Edges)
	}
}
