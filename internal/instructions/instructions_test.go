package instructions

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/types"
)

// loadFixture writes a tiny, self-contained type model and loads it. It proves
// the renderer reads whatever the registry holds — no taxonomy is baked in.
func loadFixture(t *testing.T) *types.Registry {
	t.Helper()
	dir := t.TempDir()
	write := func(name, body string) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("work-item.md", `---
type: ArtifactType
defines: WorkItem
abstract: true
fields:
  id: {required: true}
  status: {required: true}
---
`)
	write("gadget.md", `---
type: ArtifactType
defines: Gadget
extends: WorkItem
description: A test widget.
fields:
  status:
    required: true
    one_of: [active, retired]
relationships:
  uses:
    target: WorkItem
    min: 1
---
`)
	reg, err := types.Load(dir, dir, &model.Collector{})
	if err != nil {
		t.Fatal(err)
	}
	return reg
}

func render(t *testing.T, reg *types.Registry, name, format string) string {
	t.Helper()
	var b bytes.Buffer
	if err := Write(&b, reg, name, format); err != nil {
		t.Fatalf("Write(%q, %q): %v", name, format, err)
	}
	return b.String()
}

func TestTextTemplate(t *testing.T) {
	out := render(t, loadFixture(t), "Gadget", "text")
	for _, want := range []string{
		"extends WorkItem",
		"Template:",
		"type: Gadget",
		"status: active",        // enum seeds its first option
		"one of: active | retired",
		"uses: []",
		"→ WorkItem",
		"(1..*)",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("text output missing %q\n%s", want, out)
		}
	}
}

func TestAbstractHasNoTemplate(t *testing.T) {
	out := render(t, loadFixture(t), "WorkItem", "text")
	if !strings.Contains(out, "ABSTRACT") || !strings.Contains(out, "Gadget") {
		t.Errorf("abstract note missing concrete subtype:\n%s", out)
	}
	if strings.Contains(out, "Template:") {
		t.Errorf("abstract type must not emit a copy-paste template:\n%s", out)
	}
}

func TestJSONProjection(t *testing.T) {
	out := render(t, loadFixture(t), "Gadget", "json")
	var got typeOut
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("json: %v\n%s", err, out)
	}
	if got.Name != "Gadget" || got.Abstract {
		t.Errorf("unexpected header: %+v", got)
	}
	var status *fieldOut
	for i := range got.Fields {
		if got.Fields[i].Name == "status" {
			status = &got.Fields[i]
		}
	}
	if status == nil || len(status.OneOf) != 2 || !status.Required {
		t.Errorf("status field not projected with enum: %+v", status)
	}
}

func TestListAndUnknown(t *testing.T) {
	reg := loadFixture(t)
	list := render(t, reg, "", "text")
	if !strings.Contains(list, "Gadget") || !strings.Contains(list, "(abstract)") {
		t.Errorf("list missing types/abstract marker:\n%s", list)
	}
	if err := Write(&bytes.Buffer{}, reg, "Nope", "text"); err == nil {
		t.Error("unknown type should error")
	}
}
