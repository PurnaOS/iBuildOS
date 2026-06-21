package okf

import (
	"reflect"
	"testing"
)

// TestSplitCROnly covers a classic-Mac file whose lines are separated only by
// bare "\r". Before normalization the opening fence was never recognized; now
// the frontmatter parses and keys resolve.
func TestSplitCROnly(t *testing.T) {
	raw := "---\rtype: Task\rid: TASK-9\r---\rbody\r"
	front, body, start, ok, err := Split([]byte(raw))
	if err != nil {
		t.Fatalf("Split err = %v", err)
	}
	if !ok {
		t.Fatal("CR-only frontmatter not recognized")
	}
	if string(front) != "type: Task\nid: TASK-9" {
		t.Errorf("front = %q", front)
	}
	if body != "body\n" {
		t.Errorf("body = %q", body)
	}
	if start != 2 {
		t.Errorf("frontStartLine = %d, want 2", start)
	}
}

// TestParseCROnly confirms a CR-only file round-trips through Parse: frontmatter
// is detected and a top-level key is retrievable with the correct value.
func TestParseCROnly(t *testing.T) {
	raw := "---\rtype: Task\rstatus: done\r---\rbody\r"
	d, err := Parse("cr.md", []byte(raw))
	if err != nil {
		t.Fatalf("Parse err = %v", err)
	}
	if !d.HasFrontmatter {
		t.Fatal("expected HasFrontmatter true for CR-only file")
	}
	_, tv, ok := d.Get("type")
	if !ok || tv.Value != "Task" {
		t.Errorf("type = %v, ok = %v; want Task", tv, ok)
	}
	// Line numbers must stay correct after normalization: status is file line 3.
	kn, _, ok := d.Get("status")
	if !ok {
		t.Fatal("status key not found")
	}
	if got := d.Line(kn); got != 3 {
		t.Errorf("status line = %d, want 3", got)
	}
}

// TestParseCRLF mirrors the CR-only case for Windows line endings, ensuring the
// trailing "\r" no longer leaks into scalar values.
func TestParseCRLF(t *testing.T) {
	raw := "---\r\ntype: Task\r\nid: TASK-1\r\n---\r\nbody\r\n"
	d, err := Parse("crlf.md", []byte(raw))
	if err != nil {
		t.Fatalf("Parse err = %v", err)
	}
	_, idv, ok := d.Get("id")
	if !ok || idv.Value != "TASK-1" {
		t.Errorf("id = %q, want TASK-1 (no trailing CR)", idv.Value)
	}
}

// TestLinksSkipsMappingItem confirms a mapping inside a links sequence is
// dropped rather than coerced into a bogus empty LinkRef. The scalar siblings
// survive, so a too-short list correctly trips downstream min-cardinality.
func TestLinksSkipsMappingItem(t *testing.T) {
	raw := "---\n" +
		"type: Task\n" +
		"links:\n" +
		"  implements:\n" +
		"    - /r/a.md\n" +
		"    - nested: /r/bad.md\n" +
		"    - /r/c.md\n" +
		"---\n"
	d, err := Parse("x.md", []byte(raw))
	if err != nil {
		t.Fatalf("Parse err = %v", err)
	}
	refs := d.Links()["implements"]
	if len(refs) != 2 {
		t.Fatalf("implements = %v, want 2 scalar refs (mapping skipped)", refs)
	}
	if refs[0].Raw != "/r/a.md" || refs[1].Raw != "/r/c.md" {
		t.Errorf("refs = %v, want [/r/a.md /r/c.md]", refs)
	}
	for _, r := range refs {
		if r.Raw == "" {
			t.Error("a skipped mapping leaked an empty Raw LinkRef")
		}
	}
}

// TestLinksDereferencesAlias confirms a YAML alias sequence item resolves to its
// anchor's scalar value rather than an empty string.
func TestLinksDereferencesAlias(t *testing.T) {
	raw := "---\n" +
		"type: Task\n" +
		"anchors:\n" +
		"  - &ref /r/anchored.md\n" +
		"links:\n" +
		"  implements:\n" +
		"    - *ref\n" +
		"---\n"
	d, err := Parse("x.md", []byte(raw))
	if err != nil {
		t.Fatalf("Parse err = %v", err)
	}
	refs := d.Links()["implements"]
	if len(refs) != 1 || refs[0].Raw != "/r/anchored.md" {
		t.Errorf("implements = %v, want [/r/anchored.md] via alias", refs)
	}
}

// TestDuplicateTopLevelKeys detects repeated top-level keys, sorted+deduped.
func TestDuplicateTopLevelKeys(t *testing.T) {
	raw := "---\n" +
		"type: Task\n" +
		"status: todo\n" +
		"type: Story\n" +
		"id: T-1\n" +
		"status: done\n" +
		"---\n"
	d, err := Parse("dup.md", []byte(raw))
	if err != nil {
		t.Fatalf("Parse err = %v", err)
	}
	got := d.DuplicateTopLevelKeys()
	want := []string{"status", "type"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("DuplicateTopLevelKeys = %v, want %v", got, want)
	}
}

// TestDuplicateLinkRels detects repeated relationship names inside links:.
func TestDuplicateLinkRels(t *testing.T) {
	raw := "---\n" +
		"type: Task\n" +
		"links:\n" +
		"  implements: /r/a.md\n" +
		"  parent: /w/s.md\n" +
		"  implements: /r/b.md\n" +
		"---\n"
	d, err := Parse("dup.md", []byte(raw))
	if err != nil {
		t.Fatalf("Parse err = %v", err)
	}
	got := d.DuplicateLinkRels()
	want := []string{"implements"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("DuplicateLinkRels = %v, want %v", got, want)
	}
}

// TestDuplicateDetectionTolerant confirms the detectors are nil-safe: a document
// with no frontmatter (nil Map) and one with no links: both return nil.
func TestDuplicateDetectionTolerant(t *testing.T) {
	d, err := Parse("prose.md", []byte("# just markdown\n"))
	if err != nil {
		t.Fatalf("Parse err = %v", err)
	}
	if d.Map != nil {
		t.Fatal("expected nil Map for a prose file")
	}
	if got := d.DuplicateTopLevelKeys(); got != nil {
		t.Errorf("DuplicateTopLevelKeys(nil Map) = %v, want nil", got)
	}
	if got := d.DuplicateLinkRels(); got != nil {
		t.Errorf("DuplicateLinkRels(nil Map) = %v, want nil", got)
	}

	noLinks, err := Parse("x.md", []byte("---\ntype: Task\n---\n"))
	if err != nil {
		t.Fatalf("Parse err = %v", err)
	}
	if got := noLinks.DuplicateLinkRels(); got != nil {
		t.Errorf("DuplicateLinkRels(no links) = %v, want nil", got)
	}
}
