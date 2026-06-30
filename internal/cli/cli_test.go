package cli

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, _ := os.Getwd()
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("go.mod not found")
		}
		dir = parent
	}
}

func run(t *testing.T, args ...string) (int, string, string) {
	t.Helper()
	var out, errb bytes.Buffer
	code := Run(args, &out, &errb)
	return code, out.String(), errb.String()
}

func TestExitCodes(t *testing.T) {
	root := repoRoot(t)
	broken := filepath.Join(root, "testdata", "broken")

	if code, _, _ := run(t, "validate", root); code != 0 {
		t.Errorf("validate repo root: exit = %d, want 0", code)
	}
	if code, _, _ := run(t, "validate", broken); code != 1 {
		t.Errorf("validate broken: exit = %d, want 1", code)
	}
	if code, out, _ := run(t, "version"); code != 0 || strings.TrimSpace(out) == "" {
		t.Errorf("version: exit = %d out = %q", code, out)
	}
	if code, _, _ := run(t, "bogus"); code != 2 {
		t.Errorf("unknown command: exit = %d, want 2", code)
	}
	if code, _, _ := run(t, "validate", root, "--format", "xml"); code != 2 {
		t.Errorf("bad format: exit = %d, want 2", code)
	}
}

func TestGraphCommand(t *testing.T) {
	root := repoRoot(t)
	if code, out, _ := run(t, "graph", root); code != 0 || !strings.Contains(out, `"nodes"`) {
		t.Errorf("graph: exit = %d, has nodes = %v", code, strings.Contains(out, `"nodes"`))
	}
	if code, _, _ := run(t, "graph", root, "--format", "xml"); code != 2 {
		t.Errorf("graph bad format: exit = %d, want 2", code)
	}
	if code, _, _ := run(t, "graph", root, "--body", "bogus"); code != 2 {
		t.Errorf("graph bad body: exit = %d, want 2", code)
	}
	// focused query returns just the node and its neighborhood
	if code, out, _ := run(t, "graph", root, "--node", "/work/task-0001.md", "--depth", "1"); code != 0 ||
		!strings.Contains(out, "task-0001.md") || strings.Contains(out, "task-0002.md") {
		t.Errorf("graph --node depth 1: exit = %d, scoped = %v", code, !strings.Contains(out, "task-0002.md"))
	}
}

func TestInitCommand(t *testing.T) {
	dir := t.TempDir()
	if code, out, _ := run(t, "init", dir); code != 0 || !strings.Contains(out, "created") {
		t.Errorf("init: exit = %d out = %q", code, out)
	}
	// the scaffolded bundle validates clean through the CLI
	if code, _, _ := run(t, "validate", dir); code != 0 {
		t.Errorf("validate after init: exit = %d, want 0", code)
	}
}

func TestInstructionsCommand(t *testing.T) {
	root := repoRoot(t)
	typesDir := filepath.Join(root, "docs", "types")

	// single type: emits a template with the type and its links
	if code, out, _ := run(t, "instructions", "Change", "--types", typesDir); code != 0 ||
		!strings.Contains(out, "type: Change") || !strings.Contains(out, "affects") {
		t.Errorf("instructions Change: exit = %d, has template = %v", code, strings.Contains(out, "type: Change"))
	}
	// json projection
	if code, out, _ := run(t, "instructions", "Scenario", "--types", typesDir, "--format", "json"); code != 0 ||
		!strings.Contains(out, `"name": "Scenario"`) {
		t.Errorf("instructions json: exit = %d, has name = %v", code, strings.Contains(out, `"name": "Scenario"`))
	}
	// no arg lists all defined types
	if code, out, _ := run(t, "instructions", "--types", typesDir); code != 0 || !strings.Contains(out, "Change") {
		t.Errorf("instructions list: exit = %d, lists Change = %v", code, strings.Contains(out, "Change"))
	}
	// unknown type is an error
	if code, _, _ := run(t, "instructions", "Nope", "--types", typesDir); code != 1 {
		t.Errorf("instructions unknown: exit = %d, want 1", code)
	}
	// bad format is a usage error
	if code, _, _ := run(t, "instructions", "Change", "--types", typesDir, "--format", "xml"); code != 2 {
		t.Errorf("instructions bad format: exit = %d, want 2", code)
	}
}

func TestAgentsCommand(t *testing.T) {
	root := repoRoot(t)
	// default: prints AGENTS.md to stdout
	code, out, _ := run(t, "agents", root)
	if code != 0 {
		t.Fatalf("agents: exit = %d, want 0", code)
	}
	if !strings.Contains(out, "# AGENTS.md") || !strings.Contains(out, "iBuild validate") {
		t.Errorf("agents stdout did not contain the contract doc: %q", out[:min(80, len(out))])
	}

	// --out writes a file and prints "wrote ..."
	dir := t.TempDir()
	target := filepath.Join(dir, "AGENTS.md")
	code, out, _ = run(t, "agents", root, "--out", target)
	if code != 0 || !strings.Contains(out, "wrote") {
		t.Fatalf("agents --out: exit = %d out = %q", code, out)
	}
	b, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("agents --out did not write file: %v", err)
	}
	if !strings.Contains(string(b), "# AGENTS.md") {
		t.Errorf("written AGENTS.md missing header")
	}
}

func TestFlagsBeforeOrAfterPath(t *testing.T) {
	root := repoRoot(t)
	// flag after path (the form the Action uses)
	if code, out, _ := run(t, "validate", root, "--format", "json"); code != 0 || !strings.Contains(out, `"findings"`) {
		t.Errorf("flag after path: exit = %d, out has json = %v", code, strings.Contains(out, `"findings"`))
	}
	// flag before path
	if code, out, _ := run(t, "validate", "--format", "json", root); code != 0 || !strings.Contains(out, `"findings"`) {
		t.Errorf("flag before path: exit = %d, out has json = %v", code, strings.Contains(out, `"findings"`))
	}
}
