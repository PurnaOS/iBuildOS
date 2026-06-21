package site

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/graphx"
	"github.com/PurnaOS/iBuildOS/internal/validate"
)

// repoRoot walks up from the test's working directory to the bundle root (the
// dir holding .ibuildos.yaml), so the test renders the real dogfood bundle.
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, ".ibuildos.yaml")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("could not find .ibuildos.yaml above test dir")
		}
		dir = parent
	}
}

func render(t *testing.T) []byte {
	t.Helper()
	root := repoRoot(t)
	cfg, err := config.Load(root)
	if err != nil {
		t.Fatalf("config.Load: %v", err)
	}
	g, reg, err := validate.GraphWithRegistry(root, cfg, graphx.Options{Body: "excerpt"})
	if err != nil {
		t.Fatalf("GraphWithRegistry: %v", err)
	}
	findings := validate.Validate(root, cfg)
	var buf bytes.Buffer
	if err := Render(&buf, g, findings, cfg, reg); err != nil {
		t.Fatalf("Render: %v", err)
	}
	return buf.Bytes()
}

func TestSiteRender(t *testing.T) {
	out := render(t)
	s := string(out)

	// well-formed-ish, self-contained page
	if !strings.Contains(s, "<html") || !strings.Contains(s, "</html>") {
		t.Fatal("output is not an HTML document")
	}
	// the data island carries real nodes from the dogfood bundle
	if !strings.Contains(s, "/work/task-0001.md") {
		t.Fatal("rendered site is missing a known node (/work/task-0001.md)")
	}
	// the sentinel must have been replaced
	if strings.Contains(s, dataSentinel) {
		t.Fatal("data sentinel was not replaced")
	}

	// determinism: byte-identical across renders
	if out2 := render(t); !bytes.Equal(out, out2) {
		t.Fatal("render is not deterministic")
	}

	// taxonomy-blindness (non-negotiable #1): the template SOURCE must not hardcode
	// any type name or status word as a quoted literal. Those may appear only in
	// the runtime-generated data island, never in the page's logic/labels.
	banned := []string{
		`"Task"`, `'Task'`, `"Requirement"`, `'Requirement'`,
		`"done"`, `'done'`, `"implements"`, `'implements'`,
	}
	for _, b := range banned {
		if strings.Contains(templateHTML, b) {
			t.Errorf("template.html hardcodes taxonomy literal %s — classification must come from data, not the page", b)
		}
	}
}
