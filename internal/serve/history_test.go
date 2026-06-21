package serve

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
)

// historyServer builds a git bundle with THREE commits and returns a live test
// server over it. The commit timeline (newest last):
//
//	c1 initial:   unlinked bundle — Task does NOT implement the requirement
//	              (chain.reqNotImplemented error), Test verifies it.
//	c2 link:      add `implements: [requirement]` to the Task — resolves the chain
//	              error and raises the trace score.
//	c3 touch-src: edit the Task body again (source) so its last-commit date is
//	              NEWER than the requirement's — the staleness signal.
//
// Returns the server plus the three full shas, newest-first order being c3,c2,c1.
func historyServer(t *testing.T) (base string, c1, c2, c3 string) {
	t.Helper()
	dir, cfg := gitBundle(t, unlinkedBundle()) // commit c1 is created by gitInit
	// Pin c1's commit date to an early, fixed instant so the staleness %cI
	// comparison is independent of the machine's wall clock (rapid in-process
	// commits otherwise share a second and tie).
	amendDate(t, dir, "2026-06-21T10:00:00")
	c1 = headSHA(t, dir)

	// c2: link the task to the requirement (resolves chain.reqNotImplemented).
	// Explicit, distinct commit dates make %cI comparisons deterministic — rapid
	// in-process commits otherwise share a wall-clock second and tie.
	write(t, dir, "docs/work/task-0001.md",
		"---\ntype: Task\nid: TASK-0001\ntitle: Do the thing\nstatus: todo\nlinks:\n  implements: [/requirements/fr-0001.md]\n---\nWork.\n")
	runGit(t, dir, "add", "-A")
	commitAt(t, dir, "2026-06-21T11:00:00", "link task to requirement")
	c2 = headSHA(t, dir)

	// c3: edit the SOURCE (task) again, after the requirement's last commit, so a
	// staleness check flags the implements edge (source newer than target).
	write(t, dir, "docs/work/task-0001.md",
		"---\ntype: Task\nid: TASK-0001\ntitle: Do the thing\nstatus: in_progress\nlinks:\n  implements: [/requirements/fr-0001.md]\n---\nWork, revised.\n")
	runGit(t, dir, "add", "-A")
	commitAt(t, dir, "2026-06-21T12:00:00", "revise task body")
	c3 = headSHA(t, dir)

	srv := httptest.NewServer(New(dir, cfg, "test").Handler())
	t.Cleanup(srv.Close)
	t.Cleanup(func() { assertWorktreesClean(t, dir) })
	return srv.URL, c1, c2, c3
}

// commitAt commits the staged index with a fixed author+committer date (ISO,
// local), so %cI is deterministic across machines and rapid commits don't tie.
func commitAt(t *testing.T, dir, date, msg string) {
	t.Helper()
	cmd := exec.Command("git", "-C", dir, "commit", "-q", "-m", msg)
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_DATE="+date, "GIT_COMMITTER_DATE="+date)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("commit %q: %v: %s", msg, err, out)
	}
}

// amendDate rewrites HEAD's author+committer date in place (no content change),
// pinning the initial commit's %cI.
func amendDate(t *testing.T, dir, date string) {
	t.Helper()
	cmd := exec.Command("git", "-C", dir, "commit", "-q", "--amend", "--no-edit", "--reset-author")
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_DATE="+date, "GIT_COMMITTER_DATE="+date)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("amend date: %v: %s", err, out)
	}
}

func headSHA(t *testing.T, dir string) string {
	t.Helper()
	out, err := exec.Command("git", "-C", dir, "rev-parse", "HEAD").Output()
	if err != nil {
		t.Fatalf("rev-parse HEAD: %v", err)
	}
	return strings.TrimSpace(string(out))
}

// assertWorktreesClean asserts the only registered worktree is the main one (no
// orphan history/sim worktrees leaked) and the working tree is unmodified.
func assertWorktreesClean(t *testing.T, dir string) {
	t.Helper()
	out, err := exec.Command("git", "-C", dir, "worktree", "list", "--porcelain").Output()
	if err != nil {
		t.Fatalf("worktree list: %v", err)
	}
	if n := strings.Count(string(out), "worktree "); n != 1 {
		t.Errorf("expected exactly 1 worktree after history ops, got %d:\n%s", n, out)
	}
	status, err := exec.Command("git", "-C", dir, "status", "--porcelain").Output()
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if strings.TrimSpace(string(status)) != "" {
		t.Errorf("working tree not clean after history ops:\n%s", status)
	}
}

func TestHistoryListsCommitsNewestFirst(t *testing.T) {
	base, c1, c2, c3 := historyServer(t)
	resp, body := get(t, base, "/history")
	if resp.StatusCode != 200 {
		t.Fatalf("/history: %d (%s)", resp.StatusCode, body)
	}
	var commits []Commit
	if err := json.Unmarshal(body, &commits); err != nil {
		t.Fatalf("/history not JSON: %v (%s)", err, body)
	}
	if len(commits) != 3 {
		t.Fatalf("expected 3 commits, got %d: %+v", len(commits), commits)
	}
	wantOrder := []string{c3, c2, c1}
	for i, want := range wantOrder {
		if commits[i].SHA != want {
			t.Errorf("commit[%d].sha = %s, want %s", i, commits[i].SHA, want)
		}
		if commits[i].ShortSHA == "" || !strings.HasPrefix(want, commits[i].ShortSHA) {
			t.Errorf("commit[%d].shortSha = %q, not a prefix of %s", i, commits[i].ShortSHA, want)
		}
		if commits[i].DateISO == "" || commits[i].Author == "" || commits[i].Subject == "" {
			t.Errorf("commit[%d] missing fields: %+v", i, commits[i])
		}
	}
	if commits[0].Subject != "revise task body" {
		t.Errorf("newest subject = %q, want %q", commits[0].Subject, "revise task body")
	}

	// ?limit=1 windows to the newest commit only.
	_, b2 := get(t, base, "/history?limit=1")
	var one []Commit
	if err := json.Unmarshal(b2, &one); err != nil {
		t.Fatalf("/history?limit=1 not JSON: %v", err)
	}
	if len(one) != 1 || one[0].SHA != c3 {
		t.Errorf("limit=1 = %+v, want just %s", one, c3)
	}

	// invalid limit -> 400
	if r, _ := get(t, base, "/history?limit=abc"); r.StatusCode != 400 {
		t.Errorf("/history?limit=abc: %d, want 400", r.StatusCode)
	}
}

func TestHistoryAtReturnsPerShaState(t *testing.T) {
	base, c1, c2, _ := historyServer(t)

	// AS OF c1 (unlinked): the requirement is not implemented -> chain error.
	_, b1 := get(t, base, "/history/at?sha="+c1)
	var at1 HistoryAt
	if err := json.Unmarshal(b1, &at1); err != nil {
		t.Fatalf("/history/at c1 not JSON: %v (%s)", err, b1)
	}
	if at1.SHA != c1 {
		t.Errorf("at1.sha = %s, want %s", at1.SHA, c1)
	}
	if len(at1.Graph.Nodes) == 0 {
		t.Error("at1 graph has no nodes")
	}
	if at1.Errors == 0 {
		t.Error("expected chain errors in the unlinked c1 state")
	}

	// AS OF c2 (linked): the chain error is gone and the trace score rose.
	_, b2 := get(t, base, "/history/at?sha="+c2)
	var at2 HistoryAt
	if err := json.Unmarshal(b2, &at2); err != nil {
		t.Fatalf("/history/at c2 not JSON: %v (%s)", err, b2)
	}
	if at2.Errors >= at1.Errors {
		t.Errorf("expected fewer errors at c2 (%d) than c1 (%d)", at2.Errors, at1.Errors)
	}
	if at2.TraceScore <= at1.TraceScore {
		t.Errorf("expected trace score to rise: c1=%v c2=%v", at1.TraceScore, at2.TraceScore)
	}

	// missing sha -> 400; bogus sha -> 400 (resolve failure, never a panic).
	if r, _ := get(t, base, "/history/at"); r.StatusCode != 400 {
		t.Errorf("/history/at without sha: %d, want 400", r.StatusCode)
	}
	if r, _ := get(t, base, "/history/at?sha=deadbeefdeadbeef"); r.StatusCode != 400 {
		t.Errorf("/history/at bogus sha: %d, want 400", r.StatusCode)
	}
}

func TestHistoryDiffBetweenCommits(t *testing.T) {
	base, c1, c2, _ := historyServer(t)

	// from c1 -> c2 should RESOLVE chain.reqNotImplemented and lower the error count.
	_, body := get(t, base, "/history/diff?from="+c1+"&to="+c2)
	var d SimulateResult
	if err := json.Unmarshal(body, &d); err != nil {
		t.Fatalf("/history/diff not JSON: %v (%s)", err, body)
	}
	resolved := ruleSet(d.ResolvedFindings)
	if !resolved["chain.reqNotImplemented"] {
		t.Errorf("expected chain.reqNotImplemented resolved c1->c2; resolved = %v", ruleList(d.ResolvedFindings))
	}
	if d.ErrorDelta >= 0 {
		t.Errorf("expected negative errorDelta c1->c2, got %d", d.ErrorDelta)
	}
	if d.TraceScoreAfter <= d.TraceScoreBefore {
		t.Errorf("expected trace score to rise c1->c2: before=%v after=%v", d.TraceScoreBefore, d.TraceScoreAfter)
	}

	// The reverse diff c2 -> c1 should report the finding as NEW (re-broken).
	_, rbody := get(t, base, "/history/diff?from="+c2+"&to="+c1)
	var rd SimulateResult
	if err := json.Unmarshal(rbody, &rd); err != nil {
		t.Fatalf("reverse /history/diff not JSON: %v", err)
	}
	if !ruleSet(rd.NewFindings)["chain.reqNotImplemented"] {
		t.Errorf("expected chain.reqNotImplemented NEW c2->c1; new = %v", ruleList(rd.NewFindings))
	}
	if rd.ErrorDelta <= 0 {
		t.Errorf("expected positive errorDelta c2->c1, got %d", rd.ErrorDelta)
	}
}

func TestHistoryDiffDefaultsToParent(t *testing.T) {
	base, _, c2, c3 := historyServer(t)
	// to=c2 with no from -> from defaults to c2^ (== c1). The chain error should
	// be resolved going into c2.
	_, body := get(t, base, "/history/diff?to="+c2)
	var d SimulateResult
	if err := json.Unmarshal(body, &d); err != nil {
		t.Fatalf("/history/diff?to= not JSON: %v (%s)", err, body)
	}
	if !ruleSet(d.ResolvedFindings)["chain.reqNotImplemented"] {
		t.Errorf("expected default-parent diff to resolve chain.reqNotImplemented; resolved = %v", ruleList(d.ResolvedFindings))
	}

	// Fully default (no from, no to) -> HEAD vs HEAD^ (c3 vs c2): only a body/status
	// edit, so no chain finding delta but a valid, decodable response.
	r, b := get(t, base, "/history/diff")
	if r.StatusCode != 200 {
		t.Fatalf("/history/diff (defaults): %d (%s)", r.StatusCode, b)
	}
	var dd SimulateResult
	if err := json.Unmarshal(b, &dd); err != nil {
		t.Fatalf("default /history/diff not JSON: %v", err)
	}
	_ = c3
}

func TestHistoryStalenessFlagsEditedSource(t *testing.T) {
	base, _, _, _ := historyServer(t)
	resp, body := get(t, base, "/history/staleness")
	if resp.StatusCode != 200 {
		t.Fatalf("/history/staleness: %d (%s)", resp.StatusCode, body)
	}
	var sr stalenessResponse
	if err := json.Unmarshal(body, &sr); err != nil {
		t.Fatalf("/history/staleness not JSON: %v (%s)", err, body)
	}
	// The Task (source) was committed at c3, AFTER the requirement (target, last
	// touched at c1). The implements edge task->requirement must be flagged.
	var found *StaleLink
	for i := range sr.Stale {
		l := sr.Stale[i]
		if l.From == "/work/task-0001.md" && l.To == "/requirements/fr-0001.md" && l.Rel == "implements" {
			found = &sr.Stale[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("expected the implements edge to be flagged stale; got %+v", sr.Stale)
	}
	if !(found.SourceDate > found.TargetDate) {
		t.Errorf("stale link source date %q should be newer than target %q", found.SourceDate, found.TargetDate)
	}
}

// TestHistoryCacheReusesSnapshot asserts the tree-keyed cache returns the same
// snapshot for repeated /history/at requests (the windowed/repeated-request
// optimization) without leaking worktrees.
func TestHistoryCacheReusesSnapshot(t *testing.T) {
	base, c1, _, _ := historyServer(t)
	_, b1 := get(t, base, "/history/at?sha="+c1)
	_, b2 := get(t, base, "/history/at?sha="+c1)
	if string(b1) != string(b2) {
		t.Error("repeated /history/at for the same sha returned different bytes (cache should make them identical)")
	}
}
