package validate

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/model"
)

// medTypesDir writes a self-contained docs/types directory holding exactly the
// given ArtifactType definitions (filename -> content) and returns its path.
func medTypesDir(t *testing.T, defs map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, content := range defs {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// medBundle writes a single artifact doc plus a custom types dir, validates,
// and returns the findings.
func medBundle(t *testing.T, typesDir, docPath, docBody string) []model.Finding {
	t.Helper()
	dir := t.TempDir()
	full := filepath.Join(dir, filepath.FromSlash(docPath))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(docBody), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	cfg.TypesDirOverride = typesDir
	return Validate(dir, cfg)
}

// widgetTypes defines a Widget with a number field (count) and a required
// string field (name), used by the number + required tests.
const widgetTypeDef = `---
type: ArtifactType
defines: Widget
description: A type exercising number and required-field checks.
fields:
  id:
    required: true
  name:
    required: true
  count:
    type: number
---
`

// TestNumberFieldRejectsGoOnlyForms proves that type:number accepts genuine
// YAML numbers but rejects the Go-only forms strconv.ParseFloat tolerates
// (NaN, underscore separators, hex-floats).
func TestNumberFieldRejectsGoOnlyForms(t *testing.T) {
	types := medTypesDir(t, map[string]string{"widget.md": widgetTypeDef})

	reject := []string{"nan", "NaN", "inf", "-inf", "+inf", "1_000", "0x1p4", "0x10", "1e", "abc"}
	for _, v := range reject {
		body := "---\ntype: Widget\nid: W-1\nname: n\ncount: " + v + "\n---\n"
		f := medBundle(t, types, "docs/work/w.md", body)
		if !has(f, "field.type") {
			t.Errorf("count %q should be rejected as a number, got %v", v, f)
		}
	}

	accept := []string{"1.5", "1e3", "-2", "0", "42", "+7", ".5", "3.", "2.5e-3", "1E10"}
	for _, v := range accept {
		body := "---\ntype: Widget\nid: W-1\nname: n\ncount: " + v + "\n---\n"
		f := medBundle(t, types, "docs/work/w.md", body)
		if has(f, "field.type") {
			t.Errorf("count %q should be accepted as a number, got %v", v, f)
		}
	}
}

// TestRequiredFieldRejectsEmptyScalar proves a present-but-empty required field
// fails just like a missing one (both emit field.required).
func TestRequiredFieldRejectsEmptyScalar(t *testing.T) {
	types := medTypesDir(t, map[string]string{"widget.md": widgetTypeDef})

	// Empty value: `name:` with nothing after it.
	empty := medBundle(t, types, "docs/work/w.md", "---\ntype: Widget\nid: W-1\nname:\ncount: 1\n---\n")
	if !has(empty, "field.required") {
		t.Errorf("empty required field should error field.required, got %v", empty)
	}

	// Explicit null.
	null := medBundle(t, types, "docs/work/w.md", "---\ntype: Widget\nid: W-1\nname: null\ncount: 1\n---\n")
	if !has(null, "field.required") {
		t.Errorf("null required field should error field.required, got %v", null)
	}

	// Missing field still errors (regression guard for the missing path).
	missing := medBundle(t, types, "docs/work/w.md", "---\ntype: Widget\nid: W-1\ncount: 1\n---\n")
	if !has(missing, "field.required") {
		t.Errorf("missing required field should error field.required, got %v", missing)
	}

	// A present, non-empty required field must NOT error.
	ok := medBundle(t, types, "docs/work/w.md", "---\ntype: Widget\nid: W-1\nname: present\ncount: 1\n---\n")
	if has(ok, "field.required") {
		t.Errorf("present required field must not error, got %v", ok)
	}
}

// datedTypeDef requires a `when` field matching an exact YYYY-MM-DD pattern via
// json_schema. The match only succeeds when the schema sees the author's
// SOURCE TEXT (2020-01-01) — not the RFC3339 string a full YAML decode would
// produce for a !!timestamp (2020-01-01T00:00:00Z).
const datedTypeDef = `---
type: ArtifactType
defines: Dated
description: A type whose json_schema validates a date against its source text.
fields:
  id:
    required: true
json_schema:
  type: object
  properties:
    when:
      type: string
      pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
  required: [when]
---
`

// TestJSONSchemaSeesSourceText proves json_schema validates the raw scalar text
// the dialect uses, so a timestamp-shaped or quoted date is not reinterpreted.
func TestJSONSchemaSeesSourceText(t *testing.T) {
	types := medTypesDir(t, map[string]string{"dated.md": datedTypeDef})

	// Unquoted date — YAML tags it !!timestamp; a full decode would yield an
	// RFC3339 string that fails the pattern. The source-text view passes.
	ts := medBundle(t, types, "docs/work/d.md", "---\ntype: Dated\nid: D-1\nwhen: 2020-01-01\n---\n")
	if has(ts, "doc.jsonSchema") {
		t.Errorf("timestamp-shaped value should validate against its source text, got %v", ts)
	}

	// Quoted (explicit string) date — also source text, also passes.
	q := medBundle(t, types, "docs/work/d.md", "---\ntype: Dated\nid: D-1\nwhen: \"2020-01-01\"\n---\n")
	if has(q, "doc.jsonSchema") {
		t.Errorf("quoted date should validate against its source text, got %v", q)
	}

	// A value that genuinely violates the pattern still fails.
	bad := medBundle(t, types, "docs/work/d.md", "---\ntype: Dated\nid: D-1\nwhen: nope\n---\n")
	if !has(bad, "doc.jsonSchema") {
		t.Errorf("non-date value should fail json_schema, got %v", bad)
	}
}
