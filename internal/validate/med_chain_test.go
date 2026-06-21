package validate

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/PurnaOS/iBuildOS/internal/graphx"
	"github.com/PurnaOS/iBuildOS/internal/model"
)

// hasError reports whether a rule appears as an error-severity finding.
func hasError(findings []model.Finding, rule string) bool {
	for _, f := range findings {
		if f.Rule == rule && f.Severity == model.Error {
			return true
		}
	}
	return false
}

// hasWarning reports whether a rule appears as a warning-severity finding.
func hasWarning(findings []model.Finding, rule string) bool {
	for _, f := range findings {
		if f.Rule == rule && f.Severity == model.Warning {
			return true
		}
	}
	return false
}

// selfRefTypes writes a minimal data-driven profile where a single concrete
// requirement type both *is* the implements/verifies target and declares those
// relationships — the only shape under which a document can implement/verify
// itself. The default SDLC profile cannot express that (requirements declare no
// `implements`), so we build a dedicated profile here.
func selfRefTypes(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	write := func(name, body string) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("self-req.md", `---
type: ArtifactType
defines: SelfReq
description: A requirement type that can link to other SelfReqs (or itself).
fields:
  id:
    required: true
  status:
    required: true
    one_of: [proposed, accepted, implemented]
relationships:
  implements:
    target: SelfReq
  verifies:
    target: SelfReq
---
`)
	return dir
}

// TestEmptyAndDirectoryLinksUnresolved: an empty/whitespace link target and a
// link that resolves to a directory (not a regular file) must both be reported
// as link.unresolved rather than silently resolving as documents.
func TestEmptyAndDirectoryLinksUnresolved(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		// A real file so /work/ is an existing directory on disk.
		"docs/work/keep.md": "---\ntype: Persona\nid: PERSONA-x\ntitle: t\nowner: o\nstatus: approved\n---\n",
		// Whitespace target and a directory target.
		"docs/work/t.md": "---\ntype: Task\nid: TASK-1\ntitle: t\nowner: o\nstatus: in_progress\nlinks:\n  implements: [\"   \", \"/work/\"]\n---\n",
	})
	findings := Validate(dir, cfg)
	if !hasError(findings, "link.unresolved") {
		t.Fatalf("empty + directory link targets must be link.unresolved, got %v", findings)
	}
	// Two unresolved targets -> two link.unresolved findings.
	n := 0
	for _, f := range findings {
		if f.Rule == "link.unresolved" {
			n++
		}
	}
	if n != 2 {
		t.Errorf("want 2 link.unresolved (empty + directory), got %d: %v", n, findings)
	}
}

// TestSelfImplementDoesNotSatisfy: a requirement whose only implementer/verifier
// is itself must NOT satisfy its own completeness checks.
func TestSelfImplementDoesNotSatisfy(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/requirements/r.md": "---\ntype: SelfReq\nid: R-1\nstatus: accepted\nlinks:\n  implements: [/requirements/r.md]\n  verifies: [/requirements/r.md]\n---\n",
	})
	cfg.TypesDirOverride = selfRefTypes(t)

	findings := Validate(dir, cfg)
	if !hasError(findings, "chain.reqNotImplemented") {
		t.Errorf("self-implement must not satisfy reqNotImplemented, got %v", findings)
	}
	if !hasError(findings, "chain.reqNoTest") {
		t.Errorf("self-verify must not satisfy reqNoTest, got %v", findings)
	}
}

// TestDoneTaskOnlyBrokenParentStillErrors: a done task whose sole trace is an
// unresolved parent link (and no implements) must still produce an error — the
// broken parent must not silently suppress the untraced finding.
func TestDoneTaskOnlyBrokenParentStillErrors(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/tests/tp.md": "---\ntype: Test\nid: TEST-p\ntitle: t\nowner: o\nstatus: passing\nlinks:\n  verifies: [/requirements/fr.md]\n---\n",
		"docs/requirements/fr.md": "---\ntype: FunctionalRequirement\nid: FR-1\ntitle: t\nowner: o\nstatus: proposed\n---\n",
		// done, code matches, test passes, but only trace is a parent that does not resolve.
		"docs/work/t.md": "---\ntype: Task\nid: TASK-1\ntitle: t\nowner: o\nstatus: done\ncode:\n  - docs/work/**\nlinks:\n  parent: [/work/missing.md]\n  verified_by: [/tests/tp.md]\n---\n",
	})
	findings := Validate(dir, cfg)
	if !hasError(findings, "chain.doneTaskParentUnresolved") {
		t.Errorf("done task traced only through a broken parent must error, got %v", findings)
	}
	// Sanity: the trace gap must NOT collapse into doneTaskNoCode/TestNotPassing.
	if hasError(findings, "chain.doneTaskNoCode") {
		t.Errorf("code matched docs/work/** — should not report doneTaskNoCode: %v", findings)
	}
}

// TestScalarCodeFieldIsChecked: a scalar (non-list) code field is treated as a
// single glob — it must satisfy "declares code" and have its glob checked.
func TestScalarCodeFieldIsChecked(t *testing.T) {
	// done task, scalar code glob matching a real file, traces + passing test.
	dir, cfg := bundle(t, map[string]string{
		"docs/tests/tp.md": "---\ntype: Test\nid: TEST-p\ntitle: t\nowner: o\nstatus: passing\nlinks:\n  verifies: [/requirements/fr.md]\n---\n",
		"docs/requirements/fr.md": "---\ntype: FunctionalRequirement\nid: FR-1\ntitle: t\nowner: o\nstatus: proposed\n---\n",
		"docs/work/t.md": "---\ntype: Task\nid: TASK-1\ntitle: t\nowner: o\nstatus: done\ncode: docs/work/**\nlinks:\n  implements: [/requirements/fr.md]\n  verified_by: [/tests/tp.md]\n---\n",
	})
	findings := Validate(dir, cfg)
	if hasError(findings, "chain.doneTaskNoCode") {
		t.Errorf("scalar code field should count as declared code, got %v", findings)
	}
	if hasError(findings, "code.noMatch") {
		t.Errorf("scalar code glob docs/work/** matches a real file — should not be code.noMatch, got %v", findings)
	}
}

// TestScalarCodeFieldNoMatchStillChecked: a scalar code glob that matches
// nothing must still be glob-checked (code.noMatch), proving the scalar isn't
// silently skipped.
func TestScalarCodeFieldNoMatchStillChecked(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/work/t.md": "---\ntype: Task\nid: TASK-1\ntitle: t\nowner: o\nstatus: todo\ncode: nope/does/not/exist/**\n---\n",
	})
	findings := Validate(dir, cfg)
	if !hasError(findings, "code.noMatch") {
		t.Errorf("scalar code glob matching nothing must be code.noMatch, got %v", findings)
	}
}

// freeFormTaskTypes writes a profile with a task-like type (declares `code`)
// whose status field is FREE-FORM (no one_of), so a mis-cased chain status is
// not caught by field.enum — only by the chain near-miss warning.
func freeFormTaskTypes(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "job.md"),
		[]byte("---\ntype: ArtifactType\ndefines: Job\nfields:\n  code:\n    type: list\n---\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

// TestUnrecognizedChainStatusWarns: a status that differs from a configured chain
// status only by case ("Done" vs "done") silently bypasses the case-sensitive
// done-task rules — surface that near-miss as a warning. A legitimate non-action
// status ("blocked", "in_progress") matches no vocabulary and must NOT warn.
func TestUnrecognizedChainStatusWarns(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/work/t.md": "---\ntype: Job\nid: J-1\nstatus: Done\n---\n",
	})
	cfg.TypesDirOverride = freeFormTaskTypes(t)
	findings := Validate(dir, cfg)
	if !hasWarning(findings, "chain.unrecognizedStatus") {
		t.Errorf("mis-cased chain status must warn, got %v", findings)
	}
	if countErrors(findings) != 0 {
		t.Errorf("unrecognized status is a warning, not an error: %v", findings)
	}

	// A genuinely non-chain status must NOT warn (no flood on valid WIP statuses).
	dir2, cfg2 := bundle(t, map[string]string{
		"docs/work/b.md": "---\ntype: Job\nid: J-2\nstatus: blocked\n---\n",
	})
	cfg2.TypesDirOverride = freeFormTaskTypes(t)
	if f := Validate(dir2, cfg2); hasWarning(f, "chain.unrecognizedStatus") {
		t.Errorf("a legitimate non-chain status (blocked) must not warn, got %v", f)
	}
}

// TestUnknownAndAbstractTypeEdgesInGraph: the graph export must surface declared
// links of unknown- and abstract-typed documents as edges (with Target empty and
// Resolved reflecting on-disk existence) — without emitting validation findings.
func TestUnknownAndAbstractTypeEdgesInGraph(t *testing.T) {
	dir, cfg := bundle(t, map[string]string{
		"docs/work/target.md": "---\ntype: Persona\nid: PERSONA-x\ntitle: t\nowner: o\nstatus: approved\n---\n",
		// unknown type with a declared link to a real file
		"docs/work/unknown.md": "---\ntype: Frobnicator\nid: F-1\nlinks:\n  relates_to: [/work/target.md]\n---\n",
		// abstract type (WorkItem) with a declared link to a missing file
		"docs/work/abstract.md": "---\ntype: WorkItem\nid: W-1\ntitle: t\nowner: o\nstatus: s\nlinks:\n  parent: [/work/missing.md]\n---\n",
	})

	g, err := Graph(dir, cfg, graphx.Options{Body: "none"})
	if err != nil {
		t.Fatal(err)
	}

	findEdge := func(from, rel, to string) (graphx.Edge, bool) {
		for _, e := range g.Edges {
			if e.From == from && e.Relationship == rel && e.To == to {
				return e, true
			}
		}
		return graphx.Edge{}, false
	}

	ue, ok := findEdge("/work/unknown.md", "relates_to", "/work/target.md")
	if !ok {
		t.Fatalf("unknown-typed doc's declared link must appear as an edge; edges=%v", g.Edges)
	}
	if !ue.Resolved {
		t.Errorf("edge to an existing file should be Resolved=true: %+v", ue)
	}
	if ue.Target != "" {
		t.Errorf("no RelSpec for an unknown type — Target must be empty, got %q", ue.Target)
	}

	ae, ok := findEdge("/work/abstract.md", "parent", "/work/missing.md")
	if !ok {
		t.Fatalf("abstract-typed doc's declared link must appear as an edge; edges=%v", g.Edges)
	}
	if ae.Resolved {
		t.Errorf("edge to a missing file should be Resolved=false: %+v", ae)
	}
	if ae.Target != "" {
		t.Errorf("no RelSpec for an abstract type's link — Target must be empty, got %q", ae.Target)
	}

	// Tolerance: deriving export edges must not turn into validation findings for
	// the unknown/abstract types (unknown type is a doc-level warning only).
	findings := Validate(dir, cfg)
	if hasError(findings, "link.unknownTargetType") || hasError(findings, "link.wrongTarget") {
		t.Errorf("unknown/abstract link export must not add per-link validation errors: %v", findings)
	}
}
