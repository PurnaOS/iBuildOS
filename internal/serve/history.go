package serve

// history.go is iBuild Studio's Phase 4 HISTORY phase — a deterministic, AI-free
// time-machine over the bundle's git history. Everything here is a pure
// projection of COMMITTED state through the same exported deterministic core the
// CLI uses (validate.Validate / validate.Graph): no AI, no findings of its own,
// no network. It keeps every non-negotiable:
//
//   - Deterministic + sorted. `git log` is windowed (default 30) with a stable
//     machine format; every list response is sorted/deduped by the same helpers
//     the simulator uses (model.Finalize, dedupe).
//   - Never mutates the repo. The only git mutation is a throwaway detached
//     worktree (`git worktree add --detach`) per inspected commit, ALWAYS removed
//     and pruned in a defer. No commits, no checkouts of the real working tree.
//   - Reuses simulate.go. The at/diff snapshots are the exact `snap` the simulator
//     produces (snapshot(cfgFor(...))), diffed by the same diff() — so a
//     history diff between two commits is byte-identical in shape to a /simulate.
//   - OKF tolerance. Commits where the bundle/types don't exist yet never panic:
//     loadArtifacts' error is surfaced as data (an empty graph + a loadError
//     string), never a 500.
//
// Routes (all GET, read-only, deterministic):
//
//	GET /history?limit=N              recent commits touching the bundle dir
//	GET /history/at?sha=<sha>         Finalized graph + findings AS OF a commit
//	GET /history/diff?from=&to=       the simulate diff shape, between two commits
//	GET /history/staleness            suspect links: source committed after target

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/PurnaOS/iBuildOS/internal/graphx"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/validate"
)

// defaultHistoryLimit windows `git log` so /history is never the whole history.
const defaultHistoryLimit = 30

// maxHistoryLimit caps an explicit ?limit= so a request can't ask git to walk an
// unbounded slice of history.
const maxHistoryLimit = 500

// --- snapshot cache ---------------------------------------------------------

// snapCache memoizes commit snapshots keyed by the commit's TREE sha. Two commits
// (or the same commit requested repeatedly while windowing) that share a tree
// share a snapshot, so re-validation is skipped. The cache is per-process and
// UNBOUNDED.
//
// ponytail: in-memory map, unbounded for one process; fine for a local session.
// Ceiling: one snapshot per distinct bundle tree touched during the session —
// bounded by the number of commits the user time-travels to, each holding one
// graph + finding slice. A long-lived server walking deep history would grow it;
// acceptable for `iBuild serve`'s single-session lifetime. Restart to reset.
type snapCache struct {
	mu sync.Mutex
	m  map[string]snap // tree sha -> snapshot
}

func (c *snapCache) get(tree string) (snap, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	s, ok := c.m[tree]
	return s, ok
}

func (c *snapCache) put(tree string, s snap) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.m == nil {
		c.m = map[string]snap{}
	}
	c.m[tree] = s
}

// --- GET /history -----------------------------------------------------------

// Commit is one row of the windowed log of commits touching the bundle.
type Commit struct {
	SHA      string `json:"sha"`
	ShortSHA string `json:"shortSha"`
	Author   string `json:"author"`
	DateISO  string `json:"dateISO"`
	Subject  string `json:"subject"`
}

func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpError(w, http.StatusMethodNotAllowed, "GET only")
		return
	}
	limit := defaultHistoryLimit
	if l := r.URL.Query().Get("limit"); l != "" {
		n, err := parseNonNegInt(l)
		if err != nil || n == 0 {
			httpError(w, http.StatusBadRequest, "invalid limit %q (want a positive integer)", l)
			return
		}
		if n > maxHistoryLimit {
			n = maxHistoryLimit
		}
		limit = n
	}
	commits, err := bundleLog(s.bundleDir, limit)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "cannot read git history: %v", err)
		return
	}
	if commits == nil {
		commits = []Commit{}
	}
	writeJSON(w, http.StatusOK, commits)
}

// logSep is an ASCII unit separator — it cannot appear in a commit subject/author
// line, so a single-line `git log` format splits unambiguously.
const logSep = "\x1f"

// bundleLog returns the most-recent `limit` commits that touched the bundle dir,
// newest first (git log's natural order). It resolves repo root + bundle prefix
// so it works whether the bundle is the repo root or a subdirectory, then scopes
// the log to that prefix (omitted when the bundle IS the repo root).
func bundleLog(bundleDir string, limit int) ([]Commit, error) {
	top, prefix, err := repoRootAndPrefix(bundleDir)
	if err != nil {
		return nil, err
	}
	format := strings.Join([]string{"%H", "%h", "%an", "%cI", "%s"}, logSep)
	args := []string{"-C", top, "log", fmt.Sprintf("-n%d", limit), "--format=" + format}
	if prefix != "" {
		// `-- <pathspec>` scopes the log to commits touching the bundle subtree.
		args = append(args, "--", prefix)
	}
	out, err := exec.Command("git", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("git log failed: %w", err)
	}
	var commits []Commit
	for _, line := range strings.Split(strings.TrimRight(string(out), "\n"), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, logSep, 5)
		if len(parts) < 5 {
			continue
		}
		commits = append(commits, Commit{
			SHA:      parts[0],
			ShortSHA: parts[1],
			Author:   parts[2],
			DateISO:  parts[3],
			Subject:  parts[4],
		})
	}
	return commits, nil
}

// --- GET /history/at --------------------------------------------------------

// HistoryAt is the bundle's deterministic state AS OF a commit: the Finalized
// graph plus the findings/trace-score the linter computes on that tree. LoadError
// is non-empty (and graph empty) for commits predating the bundle/types — OKF
// tolerance surfaced as data, never a 500.
type HistoryAt struct {
	SHA        string          `json:"sha"`
	Graph      graphx.Graph    `json:"graph"`
	Errors     int             `json:"errors"`
	Warnings   int             `json:"warnings"`
	Findings   []model.Finding `json:"findings"`
	TraceScore float64         `json:"traceScore"`
	LoadError  string          `json:"loadError,omitempty"`
}

func (s *Server) handleHistoryAt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpError(w, http.StatusMethodNotAllowed, "GET only")
		return
	}
	sha := strings.TrimSpace(r.URL.Query().Get("sha"))
	if sha == "" {
		httpError(w, http.StatusBadRequest, "missing required ?sha=<commit>")
		return
	}
	snap, err := s.snapshotAt(sha)
	if err != nil {
		httpError(w, http.StatusBadRequest, "%v", err)
		return
	}
	g := snap.graph
	g.Finalize()
	findings := model.Finalize(snap.findings)
	if findings == nil {
		findings = []model.Finding{}
	}
	errs, warns := model.CountBySeverity(findings)
	writeJSON(w, http.StatusOK, HistoryAt{
		SHA:        sha,
		Graph:      g,
		Errors:     errs,
		Warnings:   warns,
		Findings:   findings,
		TraceScore: traceScore(snap),
		LoadError:  snap.loadError,
	})
}

// --- GET /history/diff ------------------------------------------------------

func (s *Server) handleHistoryDiff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpError(w, http.StatusMethodNotAllowed, "GET only")
		return
	}
	q := r.URL.Query()
	to := strings.TrimSpace(q.Get("to"))
	if to == "" {
		to = "HEAD"
	}
	from := strings.TrimSpace(q.Get("from"))
	if from == "" {
		// Default to the parent of `to` — the single-commit delta a reviewer wants.
		from = to + "^"
	}
	before, err := s.snapshotAt(from)
	if err != nil {
		httpError(w, http.StatusBadRequest, "from %q: %v", from, err)
		return
	}
	after, err := s.snapshotAt(to)
	if err != nil {
		httpError(w, http.StatusBadRequest, "to %q: %v", to, err)
		return
	}
	// Reuse the simulator's deterministic diff verbatim — same response shape as
	// POST /simulate (newFindings, resolvedFindings, errorDelta, exit*, trace*,
	// newOrphans, newlyBrokenLinks).
	writeJSON(w, http.StatusOK, diff(before, after))
}

// --- snapshot mechanics (shadow worktree at an arbitrary commit) ------------

// snapshotAt returns the linter snapshot of the bundle AS OF a commit, memoized
// by the commit's tree sha. It builds a throwaway detached worktree at the
// commit, locates the bundle dir inside it (repo-root + prefix), and runs the
// same snapshot() the simulator uses. The worktree is always removed + pruned.
//
// Commits where the bundle/types don't exist yet are tolerated: loadArtifacts'
// error is captured on snap.loadError (graph stays empty), never returned as a
// handler error — only an unresolvable/invalid <sha> or a worktree failure is.
func (s *Server) snapshotAt(ref string) (snap, error) {
	top, prefix, err := repoRootAndPrefix(s.bundleDir)
	if err != nil {
		return snap{}, fmt.Errorf("history needs a git repo: %w", err)
	}
	tree, err := commitTree(top, ref)
	if err != nil {
		return snap{}, fmt.Errorf("cannot resolve %q: %w", ref, err)
	}
	if cached, ok := s.snaps.get(tree); ok {
		return cached, nil
	}

	wt, cleanup, err := addWorktreeAt(top, ref)
	if err != nil {
		return snap{}, fmt.Errorf("cannot create history worktree: %w", err)
	}
	defer cleanup()

	bundleDir := filepath.Join(wt, prefix)
	// Body:"excerpt" so /history/at and /history/diff carry the same excerpt the
	// live canvas shows; the diff itself ignores excerpts so it stays stable.
	out := snapshotBody(cfgFor(s.cfg, bundleDir), graphx.Options{Body: "excerpt"})
	s.snaps.put(tree, out)
	return out, nil
}

// repoRootAndPrefix resolves the git repo top-level and the bundle's path PREFIX
// inside it (slash-terminated, empty when the bundle IS the repo root), so the
// machinery works whether the bundle is the repo root or a subdirectory. Symlinks
// are resolved on the bundle dir first so the prefix is computed against the same
// real path git reports.
func repoRootAndPrefix(bundleDir string) (top, prefix string, err error) {
	abs, e := filepath.Abs(bundleDir)
	if e != nil {
		return "", "", e
	}
	if resolved, e := filepath.EvalSymlinks(abs); e == nil {
		abs = resolved
	}
	top, e = gitToplevel(abs)
	if e != nil {
		return "", "", e
	}
	// `--show-prefix` returns the bundle's path relative to the repo root, with a
	// trailing slash (empty at the root). It is exactly the subtree pathspec.
	out, e := exec.Command("git", "-C", abs, "rev-parse", "--show-prefix").Output()
	if e != nil {
		return "", "", fmt.Errorf("git rev-parse --show-prefix failed: %w", e)
	}
	prefix = strings.TrimSpace(string(out))
	// Normalize to an OS path for filepath.Join; git always uses forward slashes.
	prefix = filepath.FromSlash(prefix)
	return top, prefix, nil
}

// commitTree resolves a commit-ish to its TREE sha — the cache key. Two commits
// with identical bundle content (e.g. a no-op commit, or `to^` == another
// inspected sha) share a tree and therefore a memoized snapshot.
func commitTree(top, ref string) (string, error) {
	out, err := exec.Command("git", "-C", top, "rev-parse", ref+"^{tree}").Output()
	if err != nil {
		return "", fmt.Errorf("git rev-parse %s^{tree}: %w", ref, err)
	}
	return strings.TrimSpace(string(out)), nil
}

// addWorktreeAt creates a detached worktree at an arbitrary commit-ish in a fresh
// temp dir OUTSIDE the repo, returning it plus a cleanup that removes + prunes it.
// addWorktree (HEAD-only, used by simulate) delegates here.
func addWorktreeAt(top, ref string) (dir string, cleanup func(), err error) {
	tmp, err := os.MkdirTemp("", "ibuild-hist-")
	if err != nil {
		return "", nil, err
	}
	wt := filepath.Join(tmp, "wt")
	cmd := exec.Command("git", "-C", top, "worktree", "add", "--detach", wt, ref)
	if out, e := cmd.CombinedOutput(); e != nil {
		os.RemoveAll(tmp)
		return "", nil, fmt.Errorf("git worktree add %s: %v: %s", ref, e, strings.TrimSpace(string(out)))
	}
	cleanup = func() {
		exec.Command("git", "-C", top, "worktree", "remove", "--force", wt).Run()
		exec.Command("git", "-C", top, "worktree", "prune").Run()
		os.RemoveAll(tmp)
	}
	return wt, cleanup, nil
}

// --- GET /history/staleness -------------------------------------------------

// StaleLink flags a resolved edge whose SOURCE document was committed MORE
// recently than its TARGET — a heuristic that the link may now be stale (the
// source changed after the thing it points at). Warning-tier, never a gate.
type StaleLink struct {
	From       string `json:"from"`
	To         string `json:"to"`
	Rel        string `json:"rel"`
	SourceDate string `json:"sourceDate"`
	TargetDate string `json:"targetDate"`
}

// stalenessResponse is the sorted list of suspect links over the CURRENT HEAD
// graph. It is a heuristic projection of git commit dates + the existing graph;
// it computes no findings and is not a gate.
type stalenessResponse struct {
	Stale []StaleLink `json:"stale"`
}

func (s *Server) handleHistoryStaleness(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpError(w, http.StatusMethodNotAllowed, "GET only")
		return
	}
	top, prefix, err := repoRootAndPrefix(s.bundleDir)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "history needs a git repo: %v", err)
		return
	}
	// HEAD graph, from the same deterministic core. Body:"none" — we only need
	// edges + node paths here.
	g, gerr := validate.Graph(s.bundleDir, s.cfg, graphx.Options{Body: "none"})
	if gerr != nil {
		// Tolerate a missing/unloadable bundle as an empty result, never a 500.
		writeJSON(w, http.StatusOK, stalenessResponse{Stale: []StaleLink{}})
		return
	}

	// Map each node key -> its bundle-relative path so we can ask git for the
	// last-commit date of the underlying file.
	pathByKey := map[string]string{}
	for _, n := range g.Nodes {
		pathByKey[n.Key] = n.Path
	}

	// Memoize per-file commit dates (one `git log -1` per distinct file).
	dateCache := map[string]string{}
	fileDate := func(bundleRelPath string) string {
		if bundleRelPath == "" {
			return ""
		}
		if d, ok := dateCache[bundleRelPath]; ok {
			return d
		}
		// The bundle-relative path is rooted at the bundle dir; prefix it to make
		// it repo-root-relative for `git -C top log`.
		repoRel := filepath.ToSlash(filepath.Join(filepath.FromSlash(prefix), filepath.FromSlash(bundleRelPath)))
		d := lastCommitDate(top, repoRel)
		dateCache[bundleRelPath] = d
		return d
	}

	var stale []StaleLink
	for _, e := range g.Edges {
		if !e.Resolved {
			continue
		}
		srcPath := pathByKey[e.From]
		dstPath := pathByKey[e.To]
		if srcPath == "" || dstPath == "" {
			continue // an endpoint outside the node set (e.g. a code/test file)
		}
		srcDate := fileDate(srcPath)
		dstDate := fileDate(dstPath)
		if srcDate == "" || dstDate == "" {
			continue // uncommitted / unknown — not a confident staleness signal
		}
		// ISO-8601 strict (%cI) is lexicographically comparable: a later source
		// date sorts strictly greater than the target's.
		if srcDate > dstDate {
			stale = append(stale, StaleLink{
				From:       e.From,
				To:         e.To,
				Rel:        e.Relationship,
				SourceDate: srcDate,
				TargetDate: dstDate,
			})
		}
	}
	sort.Slice(stale, func(i, j int) bool {
		a, b := stale[i], stale[j]
		switch {
		case a.From != b.From:
			return a.From < b.From
		case a.Rel != b.Rel:
			return a.Rel < b.Rel
		default:
			return a.To < b.To
		}
	})
	if stale == nil {
		stale = []StaleLink{}
	}
	writeJSON(w, http.StatusOK, stalenessResponse{Stale: stale})
}

// lastCommitDate returns the strict-ISO (%cI) date of the most recent commit
// touching repoRelPath, or "" if the path has no commit history yet (e.g. an
// untracked working-tree-only file).
func lastCommitDate(top, repoRelPath string) string {
	out, err := exec.Command("git", "-C", top, "log", "-1", "--format=%cI", "--", repoRelPath).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
