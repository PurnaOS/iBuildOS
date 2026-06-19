package validate

import (
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/model"
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

// bundle writes a temp bundle whose types point at the repo's real docs/types
// (override below) and returns its dir + config.
func bundle(t *testing.T, files map[string]string) (string, config.Config) {
	t.Helper()
	dir := t.TempDir()
	for p, content := range files {
		full := filepath.Join(dir, filepath.FromSlash(p))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	cfg, err := config.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	cfg.TypesDirOverride = filepath.Join(repoRoot(t), "docs", "types")
	return dir, cfg
}

func errorRules(findings []model.Finding) []string {
	var out []string
	for _, f := range findings {
		if f.Severity == model.Error {
			out = append(out, f.Rule)
		}
	}
	sort.Strings(out)
	return out
}

func has(findings []model.Finding, rule string) bool {
	for _, f := range findings {
		if f.Rule == rule {
			return true
		}
	}
	return false
}

func countErrors(findings []model.Finding) int {
	n, _ := model.CountBySeverity(findings)
	return n
}

// TestDogfood is the headline gate: iBuild validate . exits 0 on this repo.
func TestDogfood(t *testing.T) {
	root := repoRoot(t)
	cfg, err := config.Load(root)
	if err != nil {
		t.Fatal(err)
	}
	findings := Validate(root, cfg)
	if n := countErrors(findings); n != 0 {
		for _, f := range findings {
			if f.Severity == model.Error {
				t.Logf("unexpected: %s:%d [%s] %s", f.File, f.Line, f.Rule, f.Message)
			}
		}
		t.Fatalf("dogfood expected 0 errors, got %d", n)
	}
}

// TestBrokenFixture proves the failing path: exactly the three intended errors.
func TestBrokenFixture(t *testing.T) {
	dir := filepath.Join(repoRoot(t), "testdata", "broken")
	cfg, err := config.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	findings := Validate(dir, cfg)
	got := errorRules(findings)
	want := []string{"chain.doneTaskTestNotPassing", "code.noMatch", "link.wrongTarget"}
	if len(got) != len(want) {
		t.Fatalf("error rules = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("error rules = %v, want %v", got, want)
		}
	}
}

func TestUnknownTypeIsWarning(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/work/x.md": "---\ntype: Frobnicator\nid: F-1\n---\n",
	})
	findings := Validate(dir, cfg)
	if countErrors(findings) != 0 {
		t.Errorf("unknown type must not error: %v", findings)
	}
	if !has(findings, "doc.unknownType") {
		t.Errorf("want doc.unknownType warning, got %v", findings)
	}
}

func TestAbstractTypeIsError(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/work/x.md": "---\ntype: WorkItem\nid: W-1\ntitle: t\nowner: o\nstatus: s\n---\n",
	})
	findings := Validate(dir, cfg)
	if !has(findings, "doc.abstractType") {
		t.Errorf("want doc.abstractType, got %v", findings)
	}
}

func TestMissingOwnerAndRequired(t *testing.T) {
	// A Test with no owner (inherited required) and no verifies (min 1).
	dir, cfg := bundle(t, map[string]string{
		"docs/tests/t.md": "---\ntype: Test\nid: TEST-x\ntitle: t\nstatus: passing\n---\n",
	})
	findings := Validate(dir, cfg)
	if !has(findings, "field.required") {
		t.Errorf("want field.required for missing owner, got %v", findings)
	}
	if !has(findings, "rel.minCardinality") {
		t.Errorf("want rel.minCardinality for missing verifies, got %v", findings)
	}
}

func TestWrongTarget(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/work/p.md": "---\ntype: Persona\nid: PERSONA-x\ntitle: t\nowner: o\nstatus: approved\n---\n",
		"docs/work/t.md": "---\ntype: Task\nid: TASK-1\ntitle: t\nowner: o\nstatus: in_progress\nlinks:\n  implements: [/work/p.md]\n---\n",
	})
	findings := Validate(dir, cfg)
	if !has(findings, "link.wrongTarget") {
		t.Errorf("want link.wrongTarget, got %v", findings)
	}
}

func TestUnresolvedLink(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/work/t.md": "---\ntype: Task\nid: TASK-1\ntitle: t\nowner: o\nstatus: in_progress\nlinks:\n  implements: [/requirements/nope.md]\n---\n",
	})
	findings := Validate(dir, cfg)
	if !has(findings, "link.unresolved") {
		t.Errorf("want link.unresolved, got %v", findings)
	}
}

func TestCardinalityMax(t *testing.T) {
	// Story.parent has max 1; two parents -> rel.maxCardinality.
	dir, cfg := bundle(t, map[string]string{
		"docs/work/s.md": "---\ntype: Story\nid: STORY-1\ntitle: t\nowner: o\nstatus: todo\nlinks:\n  parent: [/work/e1.md, /work/e2.md]\n---\n",
	})
	findings := Validate(dir, cfg)
	if !has(findings, "rel.maxCardinality") {
		t.Errorf("want rel.maxCardinality, got %v", findings)
	}
}

func TestRequirementCompleteness(t *testing.T) {
	// Accepted FR with nothing implementing/verifying -> two chain errors.
	dir, cfg := bundle(t, map[string]string{
		"docs/requirements/fr.md": "---\ntype: FunctionalRequirement\nid: FR-1\ntitle: t\nowner: o\nstatus: accepted\n---\n",
	})
	findings := Validate(dir, cfg)
	if !has(findings, "chain.reqNotImplemented") || !has(findings, "chain.reqNoTest") {
		t.Errorf("want reqNotImplemented + reqNoTest, got %v", findings)
	}
}

func TestProposedRequirementIsWarning(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/requirements/fr.md": "---\ntype: FunctionalRequirement\nid: FR-1\ntitle: t\nowner: o\nstatus: proposed\n---\n",
	})
	findings := Validate(dir, cfg)
	if countErrors(findings) != 0 {
		t.Errorf("proposed requirement must not error: %v", findings)
	}
	if !has(findings, "chain.proposedReqUnimplemented") {
		t.Errorf("want proposedReqUnimplemented warning, got %v", findings)
	}
}

func TestCodeNoMatch(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/work/t.md": "---\ntype: Task\nid: TASK-1\ntitle: t\nowner: o\nstatus: todo\ncode:\n  - nope/does/not/exist/**\n---\n",
	})
	findings := Validate(dir, cfg)
	if !has(findings, "code.noMatch") {
		t.Errorf("want code.noMatch, got %v", findings)
	}
}

func TestDoneTaskUntraced(t *testing.T) {
	// Done task, code matches (its own dir), passing test, but implements nothing.
	dir, cfg := bundle(t, map[string]string{
		"docs/tests/tp.md":        "---\ntype: Test\nid: TEST-p\ntitle: t\nowner: o\nstatus: passing\nlinks:\n  verifies: [/requirements/fr.md]\n---\n",
		"docs/requirements/fr.md": "---\ntype: FunctionalRequirement\nid: FR-1\ntitle: t\nowner: o\nstatus: proposed\n---\n",
		"docs/work/t.md":          "---\ntype: Task\nid: TASK-1\ntitle: t\nowner: o\nstatus: done\ncode:\n  - docs/work/**\nlinks:\n  verified_by: [/tests/tp.md]\n---\n",
	})
	findings := Validate(dir, cfg)
	if !has(findings, "chain.doneTaskUntraced") {
		t.Errorf("want chain.doneTaskUntraced, got %v", findings)
	}
}

func TestJSONSchemaHatch(t *testing.T) {
	root := repoRoot(t)
	mk := func(level string) []model.Finding {
		dir := t.TempDir()
		full := filepath.Join(dir, "docs", "work", "g.md")
		os.MkdirAll(filepath.Dir(full), 0o755)
		os.WriteFile(full, []byte("---\ntype: Gadget\nid: G-1\nlevel: "+level+"\n---\n"), 0o644)
		cfg, _ := config.Load(dir)
		cfg.TypesDirOverride = filepath.Join(root, "testdata", "jsonschema", "types")
		return Validate(dir, cfg)
	}
	if f := mk("0"); !has(f, "doc.jsonSchema") {
		t.Errorf("level 0 should fail json_schema (minimum 1), got %v", f)
	}
	if f := mk("3"); has(f, "doc.jsonSchema") {
		t.Errorf("level 3 should pass json_schema, got %v", f)
	}
}
