package serve

import "testing"

func edit(t *testing.T, src string, fn func(e *fmEditor)) string {
	t.Helper()
	e, err := newFMEditor([]byte(src))
	if err != nil {
		t.Fatalf("newFMEditor: %v", err)
	}
	fn(e)
	return string(e.bytes())
}

func TestSetScalarReplacesExisting(t *testing.T) {
	src := "---\ntype: Task\nstatus: todo\nowner: bob\n---\nbody text\n"
	got := edit(t, src, func(e *fmEditor) { e.setScalar("status", "done") })
	want := "---\ntype: Task\nstatus: done\nowner: bob\n---\nbody text\n"
	if got != want {
		t.Errorf("set-status\n got %q\nwant %q", got, want)
	}
}

func TestSetScalarInsertsWhenAbsent(t *testing.T) {
	src := "---\ntype: Task\nstatus: todo\n---\nbody\n"
	got := edit(t, src, func(e *fmEditor) { e.setScalar("owner", "alice") })
	want := "---\ntype: Task\nstatus: todo\nowner: alice\n---\nbody\n"
	if got != want {
		t.Errorf("set-field insert\n got %q\nwant %q", got, want)
	}
}

func TestSetScalarQuotesWhenNeeded(t *testing.T) {
	src := "---\ntype: Task\n---\nbody\n"
	got := edit(t, src, func(e *fmEditor) { e.setScalar("note", "true") })
	want := "---\ntype: Task\nnote: \"true\"\n---\nbody\n"
	if got != want {
		t.Errorf("quote bool-like\n got %q\nwant %q", got, want)
	}
}

func TestAddLinkCreatesLinksBlock(t *testing.T) {
	src := "---\ntype: Task\nstatus: todo\n---\nbody\n"
	got := edit(t, src, func(e *fmEditor) { e.addLink("implements", "/requirements/fr-0001.md") })
	want := "---\ntype: Task\nstatus: todo\nlinks:\n  implements: [/requirements/fr-0001.md]\n---\nbody\n"
	if got != want {
		t.Errorf("add-link create links\n got %q\nwant %q", got, want)
	}
}

func TestAddLinkNewRelInExistingBlock(t *testing.T) {
	src := "---\ntype: Task\nlinks:\n  parent: [/work/story-0001.md]\n---\nbody\n"
	got := edit(t, src, func(e *fmEditor) { e.addLink("implements", "/requirements/fr-0001.md") })
	want := "---\ntype: Task\nlinks:\n  parent: [/work/story-0001.md]\n  implements: [/requirements/fr-0001.md]\n---\nbody\n"
	if got != want {
		t.Errorf("add-link new rel\n got %q\nwant %q", got, want)
	}
}

func TestAddLinkAppendsToInlineSequence(t *testing.T) {
	src := "---\ntype: Task\nlinks:\n  implements: [/requirements/fr-0001.md]\n---\nbody\n"
	got := edit(t, src, func(e *fmEditor) { e.addLink("implements", "/requirements/fr-0002.md") })
	want := "---\ntype: Task\nlinks:\n  implements: [/requirements/fr-0001.md, /requirements/fr-0002.md]\n---\nbody\n"
	if got != want {
		t.Errorf("add-link append inline\n got %q\nwant %q", got, want)
	}
}

func TestAddLinkAppendsToBlockSequence(t *testing.T) {
	src := "---\ntype: Task\nlinks:\n  implements:\n    - /requirements/fr-0001.md\n---\nbody\n"
	got := edit(t, src, func(e *fmEditor) { e.addLink("implements", "/requirements/fr-0002.md") })
	want := "---\ntype: Task\nlinks:\n  implements:\n    - /requirements/fr-0001.md\n    - /requirements/fr-0002.md\n---\nbody\n"
	if got != want {
		t.Errorf("add-link append block\n got %q\nwant %q", got, want)
	}
}

func TestAddLinkIsIdempotent(t *testing.T) {
	src := "---\ntype: Task\nlinks:\n  implements: [/requirements/fr-0001.md]\n---\nbody\n"
	got := edit(t, src, func(e *fmEditor) { e.addLink("implements", "/requirements/fr-0001.md") })
	if got != src {
		t.Errorf("add-link idempotent\n got %q\nwant %q", got, src)
	}
}

func TestEditorPreservesBodyAndNoTrailingNewline(t *testing.T) {
	src := "---\ntype: Task\nstatus: todo\n---\nbody line 1\nbody line 2"
	got := edit(t, src, func(e *fmEditor) { e.setScalar("status", "done") })
	want := "---\ntype: Task\nstatus: done\n---\nbody line 1\nbody line 2"
	if got != want {
		t.Errorf("preserve no-final-newline\n got %q\nwant %q", got, want)
	}
}

func TestEditorRejectsNoFrontmatter(t *testing.T) {
	if _, err := newFMEditor([]byte("no frontmatter here\n")); err == nil {
		t.Error("expected error for file without frontmatter fence")
	}
}
