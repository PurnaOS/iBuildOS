package report

import (
	"bytes"
	"strings"
	"testing"

	"github.com/PurnaOS/iBuildOS/internal/model"
)

func TestJSONDeterministicAndStable(t *testing.T) {
	// Unsorted input -> Finalize -> stable order, byte-identical across runs.
	in := []model.Finding{
		{Severity: model.Warning, File: "b.md", Line: 2, Rule: "r2", Message: "m"},
		{Severity: model.Error, File: "a.md", Line: 5, Rule: "r1", Message: "m"},
		{Severity: model.Error, File: "a.md", Line: 5, Rule: "r1", Message: "m"}, // dup
	}
	final := model.Finalize(in)
	if len(final) != 2 {
		t.Fatalf("dedupe failed: %d findings", len(final))
	}
	var a, b bytes.Buffer
	if err := JSON(&a, final); err != nil {
		t.Fatal(err)
	}
	if err := JSON(&b, final); err != nil {
		t.Fatal(err)
	}
	if a.String() != b.String() {
		t.Fatal("JSON output is not deterministic")
	}
	out := a.String()
	if strings.Index(out, "a.md") > strings.Index(out, "b.md") {
		t.Error("findings not sorted by file")
	}
	if !strings.Contains(out, `"errors": 1`) || !strings.Contains(out, `"warnings": 1`) {
		t.Errorf("summary counts wrong: %s", out)
	}
}

func TestJSONEmpty(t *testing.T) {
	var buf bytes.Buffer
	if err := JSON(&buf, nil); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buf.String(), `"findings": []`) {
		t.Errorf("empty findings should render []: %s", buf.String())
	}
}

func TestTextClean(t *testing.T) {
	var buf bytes.Buffer
	Text(&buf, nil)
	if !strings.Contains(buf.String(), "OK: no problems found") {
		t.Errorf("clean text report = %q", buf.String())
	}
}
