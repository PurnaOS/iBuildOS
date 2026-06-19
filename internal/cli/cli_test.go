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
