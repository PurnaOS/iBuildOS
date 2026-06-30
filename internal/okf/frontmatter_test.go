package okf

import "testing"

func TestSplit(t *testing.T) {
	tests := []struct {
		name      string
		in        string
		wantOK    bool
		wantErr   bool
		wantFront string
		wantBody  string
	}{
		{"basic", "---\na: 1\n---\nbody\n", true, false, "a: 1", "body\n"},
		{"no frontmatter", "# just markdown\n", false, false, "", "# just markdown\n"},
		{"empty frontmatter", "---\n---\nbody", true, false, "", "body"},
		{"crlf", "---\r\na: 1\r\n---\r\nbody\r\n", true, false, "a: 1", "body\n"},
		{"unterminated", "---\na: 1\nno closing fence\n", false, true, "", ""},
		{"dashes in body", "---\nt: x\n---\nintro\n\n---\n\nmore\n", true, false, "t: x", "intro\n\n---\n\nmore\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			front, body, _, ok, err := Split([]byte(tt.in))
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if ok != tt.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tt.wantOK)
			}
			if tt.wantErr {
				return
			}
			if ok && string(front) != tt.wantFront {
				t.Errorf("front = %q, want %q", front, tt.wantFront)
			}
			if body != tt.wantBody {
				t.Errorf("body = %q, want %q", body, tt.wantBody)
			}
		})
	}
}

func TestParseLineNumbers(t *testing.T) {
	// The status key is on file line 4; its reported line must account for the
	// frontmatter offset.
	raw := "---\ntype: Task\nid: TASK-1\nstatus: done\n---\nbody\n"
	d, err := Parse("x.md", []byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	kn, _, ok := d.Get("status")
	if !ok {
		t.Fatal("status key not found")
	}
	if got := d.Line(kn); got != 4 {
		t.Errorf("status line = %d, want 4", got)
	}
}

func TestParseSkipsBOM(t *testing.T) {
	raw := "\ufeff---\ntype: Task\n---\n"
	d, err := Parse("x.md", []byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if !d.HasFrontmatter {
		t.Fatal("expected frontmatter after BOM")
	}
	if _, tv, ok := d.Get("type"); !ok || tv.Value != "Task" {
		t.Errorf("type = %v, want Task", tv)
	}
}

func TestLinks(t *testing.T) {
	raw := "---\ntype: Task\nlinks:\n  implements: [/r/a.md, /r/b.md]\n  parent: /w/s.md\n---\n"
	d, err := Parse("x.md", []byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	links := d.Links()
	if len(links["implements"]) != 2 {
		t.Errorf("implements = %v, want 2", links["implements"])
	}
	if len(links["parent"]) != 1 || links["parent"][0].Raw != "/w/s.md" {
		t.Errorf("parent = %v", links["parent"])
	}
}
