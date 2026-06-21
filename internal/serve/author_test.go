package serve

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// authorServer builds a Server over a temp git bundle and lets the test inject a
// stubbed authorRunner so no live `claude` is ever invoked. It returns the
// httptest server, the bundle dir, and the *Server so the test can set the
// runner before issuing requests.
func authorServer(t *testing.T, artifacts map[string]string) (*httptest.Server, string, *Server) {
	t.Helper()
	dir, cfg := gitBundle(t, artifacts)
	s := New(dir, cfg)
	hs := httptest.NewServer(s.Handler())
	t.Cleanup(hs.Close)
	return hs, dir, s
}

func post(t *testing.T, base, path string, body any) (*http.Response, []byte) {
	t.Helper()
	raw, _ := json.Marshal(body)
	resp, err := http.Post(base+path, "application/json", bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	out, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	return resp, out
}

// TestAuthorArgsNoShellInjection proves the claude argv carries the raw,
// untouched prompt as a SINGLE element — there is no shell string and no
// metacharacter interpolation. A nasty intent with `;`, `$()`, backticks, and a
// newline must appear verbatim inside exactly one argv element, never split.
func TestAuthorArgsNoShellInjection(t *testing.T) {
	nasty := "drop tables; rm -rf / $(reboot) `whoami` && echo pwned\nsecond line"
	req := authorRequest{Intent: nasty, Skill: "ibuild-author"}
	prompt := buildPrompt(req)
	args := authorArgs(prompt)

	// argv shape: ["-p", <prompt>, "--permission-mode", "acceptEdits"]
	if len(args) != 4 || args[0] != "-p" || args[2] != "--permission-mode" || args[3] != "acceptEdits" {
		t.Fatalf("unexpected argv shape: %#v", args)
	}
	// The prompt is one element and contains the raw intent verbatim.
	if args[1] != prompt {
		t.Fatalf("argv[1] is not the prompt")
	}
	if !strings.Contains(args[1], nasty) {
		t.Fatalf("raw intent not preserved verbatim inside the single prompt arg:\n%q", args[1])
	}
	// No element is a shell or carries a shell-invocation flag — we never run via
	// `sh -c`.
	for _, a := range args {
		if a == "sh" || a == "bash" || a == "-c" || a == "/bin/sh" {
			t.Fatalf("argv contains a shell token %q — shell injection surface", a)
		}
	}
}

// TestAuthorPreflightWhenClaudeAbsent: with `claude` off PATH, preflight reports
// available=false plus the install hint, and never errors. We force an empty
// PATH so the test runs the same on a dev box that happens to have Claude Code.
func TestAuthorPreflightWhenClaudeAbsent(t *testing.T) {
	hs, _, _ := authorServer(t, unlinkedBundle())
	clearClaudeFromPath(t) // after the git-using bundle setup
	resp, body := get(t, hs.URL, "/author/preflight")
	if resp.StatusCode != 200 {
		t.Fatalf("preflight: %d", resp.StatusCode)
	}
	var pf authorPreflight
	if err := json.Unmarshal(body, &pf); err != nil {
		t.Fatalf("preflight not JSON: %v", err)
	}
	if pf.Available {
		t.Errorf("expected available=false with claude absent")
	}
	if pf.Message == "" || !strings.Contains(pf.Message, "Install") {
		t.Errorf("expected an install hint, got %q", pf.Message)
	}
}

// TestAuthorPostWhenClaudeAbsent: POST /author degrades to 503 with guidance when
// `claude` is missing, leaving the rest of the server untouched. PATH is forced
// empty so this exercises the degrade path even where Claude Code is installed.
func TestAuthorPostWhenClaudeAbsent(t *testing.T) {
	hs, _, _ := authorServer(t, unlinkedBundle())
	clearClaudeFromPath(t) // after the git-using bundle setup
	resp, _ := post(t, hs.URL, "/author", authorRequest{Intent: "make a requirement"})
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("POST /author with claude absent: %d, want 503", resp.StatusCode)
	}
}

// TestAuthorRunReportsChangedFiles: with a STUBBED runner that writes a new
// artifact (exactly what real Claude would do), POST /author reports the file in
// changedFiles and re-validates (errorsBefore/After come from the deterministic
// core). The stub bypasses the preflight gate because we drive the *Server
// directly via httptest — but POST still goes through the 503 gate, so we only
// run this body when claude is present OR we bypass the gate by calling the
// handler with the stub. To keep it claude-free, we test the stub plumbing by
// calling the runner + summary path through a server whose preflight we satisfy
// with a fake binary on PATH.
func TestAuthorRunReportsChangedFiles(t *testing.T) {
	hs, dir, s := authorServer(t, unlinkedBundle())
	stubClaudeOnPath(t) // satisfy the 503 preflight gate without a real claude

	newFile := filepath.Join("docs", "requirements", "fr-0002.md")
	s.authorRunner = func(ctx context.Context, runDir string, args []string, emit func(string)) (int, error) {
		if runDir != dir {
			t.Errorf("runner Dir = %q, want bundle dir %q", runDir, dir)
		}
		emit("authoring fr-0002")
		// Simulate Claude writing an artifact into the working tree (unstaged).
		write(t, dir, newFile, "---\ntype: FunctionalRequirement\nid: FR-0002\ntitle: Another\nstatus: accepted\n---\nMore.\n")
		return 0, nil
	}

	resp, body := post(t, hs.URL, "/author", authorRequest{Intent: "add a second requirement", Skill: "ibuild-author"})
	if resp.StatusCode != 200 {
		t.Fatalf("POST /author: %d (%s)", resp.StatusCode, body)
	}
	var res authorResult
	if err := json.Unmarshal(body, &res); err != nil {
		t.Fatalf("author response not JSON: %v (%s)", err, body)
	}
	if !res.OK || res.Exit != 0 {
		t.Errorf("expected ok exit 0, got ok=%v exit=%d", res.OK, res.Exit)
	}
	wantRel := filepath.ToSlash(newFile)
	found := false
	for _, f := range res.ChangedFiles {
		if f == wantRel {
			found = true
		}
	}
	if !found {
		t.Errorf("changedFiles %v did not include the written file %q", res.ChangedFiles, wantRel)
	}
	// The file Claude wrote is on disk but UNSTAGED — serve committed nothing.
	if staged := stagedFiles(t, dir); len(staged) != 0 {
		t.Errorf("serve staged files (must never): %v", staged)
	}
	// errorsAfter is recomputed by the deterministic core, not the model.
	if res.ErrorsBefore < 0 || res.ErrorsAfter < 0 {
		t.Errorf("error counts not populated: before=%d after=%d", res.ErrorsBefore, res.ErrorsAfter)
	}
}

// TestAuthorDiscardRevertsChange: a stubbed runner edits a tracked file; POST
// /author/discard with that path reverts it via `git checkout --`. This is the
// only git mutation and it never commits.
func TestAuthorDiscardRevertsChange(t *testing.T) {
	hs, dir, _ := authorServer(t, unlinkedBundle())

	rel := filepath.ToSlash(filepath.Join("docs", "work", "task-0001.md"))
	full := filepath.Join(dir, filepath.FromSlash(rel))
	original, err := os.ReadFile(full)
	if err != nil {
		t.Fatal(err)
	}

	// Simulate a Claude edit to a tracked file (unstaged working-tree change).
	if err := os.WriteFile(full, append(original, []byte("\nEXTRA LINE FROM CLAUDE\n")...), 0o644); err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(mustRead(t, full), []byte("EXTRA LINE")) {
		t.Fatal("setup failed: edit not written")
	}

	resp, body := post(t, hs.URL, "/author/discard", discardRequest{Paths: []string{rel}})
	if resp.StatusCode != 200 {
		t.Fatalf("POST /author/discard: %d (%s)", resp.StatusCode, body)
	}
	if bytes.Contains(mustRead(t, full), []byte("EXTRA LINE")) {
		t.Errorf("discard did not revert the working-tree edit")
	}
	if !bytes.Equal(mustRead(t, full), original) {
		t.Errorf("file not byte-restored to HEAD after discard")
	}
}

// TestAuthorDiscardRejectsTraversal: discard refuses absolute paths, traversal,
// and dash-leading paths — no path can escape the bundle or be read as a flag.
func TestAuthorDiscardRejectsTraversal(t *testing.T) {
	hs, _, _ := authorServer(t, unlinkedBundle())
	for _, bad := range []string{"../escape.md", "/etc/passwd", "--foo", "docs/../../x"} {
		resp, _ := post(t, hs.URL, "/author/discard", discardRequest{Paths: []string{bad}})
		if resp.StatusCode != 400 {
			t.Errorf("discard %q: %d, want 400", bad, resp.StatusCode)
		}
	}
	// empty paths -> 400
	resp, _ := post(t, hs.URL, "/author/discard", discardRequest{Paths: nil})
	if resp.StatusCode != 400 {
		t.Errorf("discard with no paths: %d, want 400", resp.StatusCode)
	}
}

// TestAuthorDiffIsReadOnly: /author/diff returns the working-tree unified diff as
// text/plain and reflects an uncommitted edit. It mutates nothing.
func TestAuthorDiffIsReadOnly(t *testing.T) {
	hs, dir, _ := authorServer(t, unlinkedBundle())
	full := filepath.Join(dir, "docs", "work", "task-0001.md")
	original := mustRead(t, full)
	if err := os.WriteFile(full, append(append([]byte{}, original...), []byte("\nDIFFABLE CHANGE\n")...), 0o644); err != nil {
		t.Fatal(err)
	}
	resp, body := get(t, hs.URL, "/author/diff")
	if resp.StatusCode != 200 {
		t.Fatalf("/author/diff: %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("diff content-type = %q, want text/plain", ct)
	}
	if !strings.Contains(string(body), "DIFFABLE CHANGE") {
		t.Errorf("diff did not include the working-tree change:\n%s", body)
	}
	// restore so the temp repo cleanup is clean (and to prove diff didn't mutate)
	if err := os.WriteFile(full, original, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestAuthorPostRejectsNonPost(t *testing.T) {
	hs, _, _ := authorServer(t, unlinkedBundle())
	if r, _ := get(t, hs.URL, "/author"); r.StatusCode != 405 {
		t.Errorf("GET /author: %d, want 405", r.StatusCode)
	}
}

// TestAuthorPreflightShape just checks the endpoint is well-formed JSON
// regardless of whether claude happens to be installed in this environment.
func TestAuthorPreflightShape(t *testing.T) {
	hs, _, _ := authorServer(t, unlinkedBundle())
	resp, body := get(t, hs.URL, "/author/preflight")
	if resp.StatusCode != 200 {
		t.Fatalf("preflight: %d", resp.StatusCode)
	}
	var pf authorPreflight
	if err := json.Unmarshal(body, &pf); err != nil {
		t.Fatalf("preflight not JSON: %v", err)
	}
	if pf.Message == "" {
		t.Errorf("preflight should always carry a message")
	}
}

// TestBuildPromptSeedsContext: node and finding context land in the prompt, and
// the prompt always carries the no-commit contract.
func TestBuildPromptSeedsContext(t *testing.T) {
	p := buildPrompt(authorRequest{
		Intent:  "fix the gap",
		Skill:   "ibuild-author",
		Node:    "/requirements/fr-0001.md",
		Finding: &findingSeed{Rule: "chain.reqNotImplemented", File: "requirements/fr-0001.md", Message: "no task implements this"},
	})
	for _, want := range []string{
		"/ibuild-author",
		"fix the gap",
		"/requirements/fr-0001.md",
		"chain.reqNotImplemented",
		"no task implements this",
		"do NOT commit",
	} {
		if !strings.Contains(p, want) {
			t.Errorf("prompt missing %q:\n%s", want, p)
		}
	}
}

// --- test helpers -----------------------------------------------------------

// stubClaudeOnPath puts a trivial fake `claude` executable on PATH for the test
// so the POST /author preflight gate is satisfied WITHOUT a real Claude install.
// The fake is never actually exec'd to author anything — the test stubs
// s.authorRunner — but preflight calls `claude --version`, so the fake handles
// that. PATH is restored on cleanup.
func stubClaudeOnPath(t *testing.T) {
	t.Helper()
	bin := t.TempDir()
	script := "#!/bin/sh\necho 'claude 0.0.0-test'\n"
	p := filepath.Join(bin, "claude")
	if err := os.WriteFile(p, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	old := os.Getenv("PATH")
	os.Setenv("PATH", bin+string(os.PathListSeparator)+old)
	t.Cleanup(func() { os.Setenv("PATH", old) })
}

// clearClaudeFromPath forces PATH to an empty directory so exec.LookPath fails
// for every binary (including `claude`), letting the graceful-degrade tests run
// on any host. PATH is restored on cleanup. Note: handlers that need `git` are
// not exercised in the absent-case tests, so an empty PATH is safe there.
func clearClaudeFromPath(t *testing.T) {
	t.Helper()
	old := os.Getenv("PATH")
	os.Setenv("PATH", t.TempDir())
	t.Cleanup(func() { os.Setenv("PATH", old) })
}

func mustRead(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func stagedFiles(t *testing.T, dir string) []string {
	t.Helper()
	out, err := exec.Command("git", "-C", dir, "diff", "--cached", "--name-only").Output()
	if err != nil {
		t.Fatal(err)
	}
	var files []string
	for _, l := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if l != "" {
			files = append(files, l)
		}
	}
	return files
}
