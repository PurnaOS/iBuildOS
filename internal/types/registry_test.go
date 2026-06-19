package types

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/PurnaOS/iBuildOS/internal/model"
)

// repoRoot walks up from the test's working directory to the module root.
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
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

func loadReal(t *testing.T) *Registry {
	t.Helper()
	root := repoRoot(t)
	var c model.Collector
	reg, err := Load(filepath.Join(root, "docs", "types"), root, &c)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range c.Items {
		if f.Severity == model.Error {
			t.Fatalf("unexpected type-model error: %+v", f)
		}
	}
	return reg
}

func TestRealTypesLoad(t *testing.T) {
	reg := loadReal(t)
	for _, name := range []string{"Task", "FunctionalRequirement", "Test", "WorkItem", "BacklogItem", "Requirement"} {
		if !reg.Has(name) {
			t.Errorf("registry missing type %q", name)
		}
	}
	// overview.md (type: Reference) and index.md (no frontmatter) must be skipped.
	if reg.Has("Reference") {
		t.Error("Reference should not be a registered type")
	}
}

func TestSatisfiesPolymorphism(t *testing.T) {
	reg := loadReal(t)
	cases := []struct {
		docType, target string
		want            bool
	}{
		{"FunctionalRequirement", "Requirement", true},
		{"BusinessRequirement", "Requirement", true},
		{"Task", "BacklogItem", true},
		{"Task", "WorkItem", true},
		{"Story", "BacklogItem", true},
		{"Persona", "Requirement", false},
		{"Task", "Requirement", false},
		{"Requirement", "Requirement", true},
	}
	for _, c := range cases {
		if got := reg.Satisfies(c.docType, c.target); got != c.want {
			t.Errorf("Satisfies(%q, %q) = %v, want %v", c.docType, c.target, got, c.want)
		}
	}
}

func TestExtendsOverrideAndInheritance(t *testing.T) {
	reg := loadReal(t)
	task, ok := reg.Resolve("Task")
	if !ok {
		t.Fatal("Task not resolved")
	}
	// inherited from WorkItem
	for _, f := range []string{"id", "title", "owner", "status"} {
		if _, ok := task.Fields[f]; !ok {
			t.Errorf("Task missing inherited field %q", f)
		}
	}
	// child override: Task narrows status enum to include "done" and sets the id pattern
	if !contains(task.Fields["status"].OneOf, "done") {
		t.Errorf("Task.status one_of = %v, want it to include done", task.Fields["status"].OneOf)
	}
	if re := task.Fields["id"].Re; re == nil || !re.MatchString("TASK-9") {
		t.Error("Task.id pattern not applied via override")
	}
	// the Phase-1 addition: a list-typed code field
	if task.Fields["code"].Type != "list" {
		t.Errorf("Task.code type = %q, want list", task.Fields["code"].Type)
	}
}

func TestAbstractAndConcreteSubtypes(t *testing.T) {
	reg := loadReal(t)
	if r, _ := reg.Resolve("WorkItem"); !r.Abstract {
		t.Error("WorkItem should be abstract")
	}
	subs := reg.ConcreteSubtypes("Requirement")
	if !contains(subs, "FunctionalRequirement") {
		t.Errorf("ConcreteSubtypes(Requirement) = %v, want FunctionalRequirement", subs)
	}
	for _, s := range subs {
		if d := reg.defs[s]; d != nil && d.Abstract {
			t.Errorf("ConcreteSubtypes returned abstract type %q", s)
		}
	}
}

// TestGenericLoader is non-negotiable #1: a DIFFERENT docs/types yields DIFFERENT
// enforcement through the SAME engine, with zero code change.
func TestGenericLoader(t *testing.T) {
	root := repoRoot(t)
	var c model.Collector
	reg, err := Load(filepath.Join(root, "testdata", "alttypes"), root, &c)
	if err != nil {
		t.Fatal(err)
	}
	if !reg.Has("Widget") {
		t.Fatal("alt registry missing Widget")
	}
	if reg.Has("Task") {
		t.Error("alt registry should not know Task — proves no hardcoded taxonomy")
	}
	w, _ := reg.Resolve("Widget")
	if !w.Fields["sku"].Required {
		t.Error("Widget.sku should be required")
	}
	if w.Fields["sku"].Re == nil || !w.Fields["sku"].Re.MatchString("W-12") {
		t.Error("Widget.sku pattern not compiled")
	}
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
