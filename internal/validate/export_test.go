package validate

import (
	"path/filepath"
	"testing"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/graphx"
	"github.com/PurnaOS/iBuildOS/internal/model"
)

func findNode(g graphx.Graph, key string) (graphx.Node, bool) {
	for _, n := range g.Nodes {
		if n.Key == key {
			return n, true
		}
	}
	return graphx.Node{}, false
}

// TestGraphDogfood is the graph analog of TestDogfood: the export over the real
// repo is well-formed — one node per artifact and the seed chain resolved.
func TestGraphDogfood(t *testing.T) {
	root := repoRoot(t)
	cfg, err := config.Load(root)
	if err != nil {
		t.Fatal(err)
	}

	g, err := Graph(root, cfg, graphx.Options{Body: "excerpt"})
	if err != nil {
		t.Fatal(err)
	}

	// node count == number of matched artifacts (recompute via the same loader).
	_, arts, err := loadArtifacts(root, cfg, &model.Collector{})
	if err != nil {
		t.Fatal(err)
	}
	if len(g.Nodes) != len(arts) {
		t.Fatalf("node count %d != artifact count %d", len(g.Nodes), len(arts))
	}

	task, ok := findNode(g, "/work/task-0001.md")
	if !ok {
		t.Fatal("task-0001 node missing")
	}
	if task.Type != "Task" || task.Status != "done" {
		t.Errorf("task-0001 type/status = %q/%q", task.Type, task.Status)
	}
	if task.Fields["title"] == nil || task.Excerpt == "" {
		t.Errorf("task-0001 should carry a title field and an excerpt: %+v", task)
	}

	// the seed chain edges resolve
	wantEdge := func(from, rel, to string) {
		for _, e := range g.Edges {
			if e.From == from && e.Relationship == rel && e.To == to {
				if !e.Resolved {
					t.Errorf("edge %s -%s-> %s should be resolved", from, rel, to)
				}
				return
			}
		}
		t.Errorf("missing edge %s -%s-> %s", from, rel, to)
	}
	wantEdge("/work/task-0001.md", "implements", "/requirements/fr-0001.md")
	wantEdge("/work/task-0001.md", "verified_by", "/tests/test-loader.md")

	// types summary projects the registry (Task present, non-abstract, with ancestors)
	var sawTask bool
	for _, ts := range g.Types {
		if ts.Name == "Task" {
			sawTask = true
			if ts.Abstract || len(ts.Ancestors) < 2 {
				t.Errorf("Task type summary wrong: %+v", ts)
			}
		}
	}
	if !sawTask {
		t.Error("types summary missing Task")
	}
}

// TestGraphDataDriven proves no taxonomy leaked into the encoder: an alternate
// profile (Widget: sku + status, no title/owner) yields a node with fields.sku
// and no title/owner key.
func TestGraphDataDriven(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/work/w.md": "---\ntype: Widget\nsku: W-1\nstatus: open\n---\nA widget body.\n",
	})
	cfg.TypesDirOverride = filepath.Join(repoRoot(t), "testdata", "alttypes")

	g, err := Graph(dir, cfg, graphx.Options{Body: "excerpt"})
	if err != nil {
		t.Fatal(err)
	}
	n, ok := findNode(g, "/work/w.md")
	if !ok {
		t.Fatal("widget node missing")
	}
	if n.Type != "Widget" || !n.KnownType {
		t.Errorf("widget node type/known = %q/%v", n.Type, n.KnownType)
	}
	if n.Fields["sku"] != "W-1" {
		t.Errorf("widget should carry fields.sku=W-1, got %v", n.Fields["sku"])
	}
	if _, leaked := n.Fields["title"]; leaked {
		t.Error("title leaked into fields for a profile that has no title")
	}
	if _, leaked := n.Fields["owner"]; leaked {
		t.Error("owner leaked into fields for a profile that has no owner")
	}
}

// TestGraphBodyModes covers excerpt/full/none.
func TestGraphBodyModes(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/work/w.md": "---\ntype: Widget\nsku: W-1\nstatus: open\n---\nFirst para.\n\nSecond para.\n",
	})
	cfg.TypesDirOverride = filepath.Join(repoRoot(t), "testdata", "alttypes")

	none, _ := Graph(dir, cfg, graphx.Options{Body: "none"})
	if n, _ := findNode(none, "/work/w.md"); n.Excerpt != "" {
		t.Errorf("body=none should drop excerpt, got %q", n.Excerpt)
	}
	full, _ := Graph(dir, cfg, graphx.Options{Body: "full"})
	if n, _ := findNode(full, "/work/w.md"); n.Excerpt != "First para.\n\nSecond para." {
		t.Errorf("body=full should keep whole body, got %q", n.Excerpt)
	}
	exc, _ := Graph(dir, cfg, graphx.Options{Body: "excerpt"})
	if n, _ := findNode(exc, "/work/w.md"); n.Excerpt != "First para." {
		t.Errorf("body=excerpt should keep first paragraph, got %q", n.Excerpt)
	}
}
