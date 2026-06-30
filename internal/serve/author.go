package serve

// author.go is iBuild Studio's single AI seam — the Phase 3 AUTHOR phase. It is
// orchestration only: it drives a LOCAL Claude Code process to author OKF
// artifacts from the UI and then re-runs the deterministic core to refresh the
// canvas. It keeps every non-negotiable:
//
//   - The deterministic core stays AI-free. Nothing here is imported by the
//     linter; validate.Validate / validate.Graph never call into author.go.
//   - Suggest-only / NEVER commits. serve writes NO files itself and runs NO git
//     mutation except a DISCARD (`git checkout --`). Claude writes artifact files
//     into the working tree, left UNSTAGED for the human; committing is the human's
//     job (the skills' contract forbids the model from committing).
//   - Localhost only. The whole server already binds 127.0.0.1; nothing here
//     changes that.
//   - No new module dependencies: stdlib net/http + os/exec + the existing
//     internal packages only.
//   - Graceful degrade. If `claude` is absent, /author returns 503 with install
//     guidance and the rest of the server is unaffected.

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/PurnaOS/iBuildOS/internal/graphx"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/validate"
)

// claudeBin is the local Claude Code CLI we orchestrate. Found via PATH; never a
// shell string.
const claudeBin = "claude"

// authorRunner is the injectable seam for the headless Claude invocation. The
// real one (execAuthorRunner) shells out via os/exec with an argument SLICE;
// tests stub it so the suite never needs a live `claude` and never mutates the
// real repo. It streams each stdout/stderr line to emit and returns the process
// exit code.
type authorRunner func(ctx context.Context, dir string, args []string, emit func(string)) (int, error)

// installHint is the helpful guidance returned whenever `claude` is missing — on
// preflight (available:false) and on POST /author (503). It points at the install
// path and reassures that the deterministic Studio still works without AI.
const installHint = "Local Claude Code CLI not found on PATH. Install it (https://docs.claude.com/claude-code) " +
	"to enable AI authoring. The Studio UI, the graph/validate oracles, and the AI-free /simulate all work without it."

// --- GET /author/preflight --------------------------------------------------

// authorPreflight is the GET /author/preflight body: is the local `claude` CLI
// available, and at what version.
type authorPreflight struct {
	Available bool   `json:"available"`
	Version   string `json:"version"`
	Message   string `json:"message"`
}

func (s *Server) handleAuthorPreflight(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, preflight())
}

// preflight detects the local `claude` binary on PATH and, if present, asks it
// for its version under a short timeout. No AI runs here — `--version` is a pure
// metadata probe — and a missing/erroring binary degrades gracefully.
func preflight() authorPreflight {
	if _, err := exec.LookPath(claudeBin); err != nil {
		return authorPreflight{Available: false, Message: installHint}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, claudeBin, "--version").Output()
	version := strings.TrimSpace(string(out))
	if err != nil {
		// On PATH but the version probe failed: still available, just unknown.
		return authorPreflight{
			Available: true,
			Version:   version,
			Message:   "claude found on PATH (version probe failed)",
		}
	}
	return authorPreflight{Available: true, Version: version, Message: "claude found on PATH"}
}

// --- POST /author -----------------------------------------------------------

// finding seeds a "fix this gap" run from a linter finding the UI surfaced.
type findingSeed struct {
	Rule    string `json:"rule"`
	File    string `json:"file"`
	Message string `json:"message"`
}

// authorRequest is the POST /author body. intent is required free-form PM text;
// the rest are optional context that seed the prompt.
type authorRequest struct {
	Intent  string       `json:"intent"`
	Skill   string       `json:"skill"`
	Node    string       `json:"node"`
	Finding *findingSeed `json:"finding"`
}

// authorResult is the POST /author summary. The deterministic before/after error
// counts and the working-tree changedFiles let the UI show what the run did
// without trusting the model's own account.
type authorResult struct {
	OK           bool     `json:"ok"`
	Exit         int      `json:"exit"`
	ChangedFiles []string `json:"changedFiles"`
	ErrorsBefore int      `json:"errorsBefore"`
	ErrorsAfter  int      `json:"errorsAfter"`
}

// knownSkills is the vendored /ibuild-* skill set a run may target. An unknown
// skill is rejected (we never interpolate an arbitrary token into the prompt as a
// slash command). Empty skill is allowed — the prompt then lets Claude pick.
var knownSkills = map[string]bool{
	"ibuild-discover":   true,
	"ibuild-plan":       true,
	"ibuild-author":     true,
	"ibuild-implement":  true,
	"ibuild-audit":      true,
	"ibuild-bug":        true,
	"ibuild-contradict": true,
	"ibuild-init":       true,
	"ibuild-ship":       true,
	"ibuild-status":     true,
}

func (s *Server) handleAuthor(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpError(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	// Graceful degrade: no local claude -> 503 with the same install guidance.
	if !preflight().Available {
		httpError(w, http.StatusServiceUnavailable, "%s", installHint)
		return
	}

	var req authorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid request JSON: %v", err)
		return
	}
	req.Intent = strings.TrimSpace(req.Intent)
	if req.Intent == "" {
		httpError(w, http.StatusBadRequest, "missing required %q (free-form authoring intent)", "intent")
		return
	}
	if req.Skill != "" && !knownSkills[req.Skill] {
		httpError(w, http.StatusBadRequest, "unknown skill %q (use one of the vendored /ibuild-* skills)", req.Skill)
		return
	}

	prompt := buildPrompt(req)
	args := authorArgs(prompt)

	// Errors before the run, from the deterministic core (never trust the model).
	errsBefore, _ := model.CountBySeverity(validate.Validate(s.bundleDir, s.cfg))

	s.bcast.Publish(Event{Name: "author.start", Data: jsonStr(map[string]string{
		"skill":  req.Skill,
		"intent": req.Intent,
	})})

	emit := func(line string) {
		s.bcast.Publish(Event{Name: "author.log", Data: jsonStr(map[string]string{"line": line})})
	}

	// The headless Claude Code run, in the BUNDLE dir so it loads the project's
	// vendored .claude/ skills. Streamed to the /events activity feed.
	exit, runErr := s.authorRunner(r.Context(), s.bundleDir, args, emit)

	// Re-run the deterministic core on the (possibly Claude-edited) tree and
	// publish the fresh state so the UI canvas refreshes.
	errsAfter, _ := model.CountBySeverity(validate.Validate(s.bundleDir, s.cfg))
	s.publishGraph()

	changed, _ := s.changedBundleFiles()

	res := authorResult{
		OK:           runErr == nil && exit == 0,
		Exit:         exit,
		ChangedFiles: changed,
		ErrorsBefore: errsBefore,
		ErrorsAfter:  errsAfter,
	}
	s.bcast.Publish(Event{Name: "author.done", Data: jsonStr(map[string]any{
		"ok":           res.OK,
		"exit":         res.Exit,
		"changedFiles": res.ChangedFiles,
		"errorsBefore": res.ErrorsBefore,
		"errorsAfter":  res.ErrorsAfter,
	})})

	if runErr != nil {
		// The process failed to start or was killed; surface it but still return
		// the deterministic before/after so the UI stays consistent.
		s.bcast.Publish(Event{Name: "author.error", Data: jsonStr(map[string]string{"error": runErr.Error()})})
	}
	writeJSON(w, http.StatusOK, res)
}

// authorArgs builds the headless Claude Code argument SLICE. The free-form intent
// rides inside the prompt, which is passed as ONE argv element after `-p`; it is
// NEVER concatenated into a shell string and NEVER reaches a shell. acceptEdits
// lets Claude write artifact files; the skills' contract still forbids committing.
//
// Returning the slice (rather than constructing the *exec.Cmd here) keeps it
// trivially assertable in tests that no shell metacharacter interpolation can
// occur: the raw prompt is a single, distinct element of the returned slice.
func authorArgs(prompt string) []string {
	return []string{"-p", prompt, "--permission-mode", "acceptEdits"}
}

// buildPrompt assembles the instruction we hand Claude. It asks Claude to run the
// chosen /ibuild-* skill with the user's intent, seeding node/finding context
// when provided. The intent is embedded verbatim — it is data inside the prompt
// string, never a shell token.
func buildPrompt(req authorRequest) string {
	var b strings.Builder
	if req.Skill != "" {
		fmt.Fprintf(&b, "Run the /%s skill from this project's vendored .claude/ to author OKF artifacts.\n\n", req.Skill)
	} else {
		b.WriteString("Pick the most appropriate /ibuild-* skill from this project's vendored .claude/ and run it to author OKF artifacts.\n\n")
	}
	b.WriteString("Authoring intent (from the product manager):\n")
	b.WriteString(req.Intent)
	b.WriteString("\n")
	if req.Node != "" {
		fmt.Fprintf(&b, "\nFocus on this artifact (root-relative key): %s\n", req.Node)
	}
	if req.Finding != nil && (req.Finding.Rule != "" || req.Finding.File != "" || req.Finding.Message != "") {
		b.WriteString("\nClose this traceability gap the linter reported:\n")
		if req.Finding.Rule != "" {
			fmt.Fprintf(&b, "  rule:    %s\n", req.Finding.Rule)
		}
		if req.Finding.File != "" {
			fmt.Fprintf(&b, "  file:    %s\n", req.Finding.File)
		}
		if req.Finding.Message != "" {
			fmt.Fprintf(&b, "  message: %s\n", req.Finding.Message)
		}
	}
	b.WriteString("\nWrite the artifact files into the working tree. Do NOT git add and do NOT commit — " +
		"leave the edits unstaged for the human to review. Then run `iBuild validate .` and report the result.")
	return b.String()
}

// execAuthorRunner is the real, AI-touching runner: a headless Claude Code
// process built from an argument SLICE (NO shell), with Dir set to the bundle so
// it loads the project's vendored .claude/ skills. stdout+stderr are streamed
// line-by-line to emit.
func execAuthorRunner(ctx context.Context, dir string, args []string, emit func(string)) (int, error) {
	cmd := exec.CommandContext(ctx, claudeBin, args...)
	cmd.Dir = dir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return -1, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return -1, err
	}
	if err := cmd.Start(); err != nil {
		return -1, err
	}

	done := make(chan struct{}, 2)
	stream := func(rc io.Reader) {
		sc := bufio.NewScanner(rc)
		sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for sc.Scan() {
			emit(sc.Text())
		}
		done <- struct{}{}
	}
	go stream(stdout)
	go stream(stderr)
	<-done
	<-done

	if err := cmd.Wait(); err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			return ee.ExitCode(), nil // a non-zero exit is data, not a runner error
		}
		return -1, err
	}
	return 0, nil
}

// --- GET /author/diff -------------------------------------------------------

// handleAuthorDiff returns the working-tree unified diff of the bundle as
// text/plain. Read-only: it runs `git diff` and mutates nothing. The diff is
// scoped to the bundle subtree (pathspec) so a bundle served from a repo
// subdirectory never shows unrelated changes elsewhere in the repo.
func (s *Server) handleAuthorDiff(w http.ResponseWriter, r *http.Request) {
	top, prefix, err := repoRootAndPrefix(s.bundleDir)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "cannot resolve repo: %v", err)
		return
	}
	args := []string{"-C", top, "diff"}
	if sp := filepath.ToSlash(prefix); sp != "" {
		args = append(args, "--", sp)
	}
	cmd := exec.Command("git", args...)
	out, err := cmd.Output()
	if err != nil {
		httpError(w, http.StatusInternalServerError, "cannot compute diff: %v", err)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(out)
}

// --- POST /author/discard ---------------------------------------------------

type discardRequest struct {
	Paths []string `json:"paths"`
}

type discardResult struct {
	Discarded []string `json:"discarded"`
}

// handleAuthorDiscard reverts the named working-tree paths with `git checkout
// --`. This is the ONLY git mutation the server performs and it only DISCARDS
// edits, never commits or stages. Paths are bundle-relative and must stay inside
// the bundle (no traversal, no absolute paths, no flag injection).
func (s *Server) handleAuthorDiscard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpError(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	var req discardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid request JSON: %v", err)
		return
	}
	if len(req.Paths) == 0 {
		httpError(w, http.StatusBadRequest, "missing %q (working-tree paths to revert)", "paths")
		return
	}
	for _, p := range req.Paths {
		if err := safeRelPath(p); err != nil {
			httpError(w, http.StatusBadRequest, "rejected path %q: %v", p, err)
			return
		}
	}

	// `--` terminates options so a path can never be parsed as a git flag.
	args := append([]string{"-C", s.bundleDir, "checkout", "--"}, req.Paths...)
	cmd := exec.Command("git", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		httpError(w, http.StatusInternalServerError, "git checkout failed: %v: %s", err, strings.TrimSpace(string(out)))
		return
	}
	s.publishGraph()
	writeJSON(w, http.StatusOK, discardResult{Discarded: req.Paths})
}

// safeRelPath rejects anything that isn't a plain bundle-relative path: no
// absolute paths, no `..` traversal, no leading dash (which git could read as a
// flag even after `--` in some shells/tools — belt and suspenders).
func safeRelPath(p string) error {
	if p == "" {
		return fmt.Errorf("empty path")
	}
	if strings.HasPrefix(p, "/") {
		return fmt.Errorf("absolute paths not allowed")
	}
	if strings.HasPrefix(p, "-") {
		return fmt.Errorf("paths may not start with %q", "-")
	}
	for _, seg := range strings.Split(filepathToSlash(p), "/") {
		if seg == ".." {
			return fmt.Errorf("path traversal (%q) not allowed", "..")
		}
	}
	return nil
}

// --- shared helpers ---------------------------------------------------------

// changedBundleFiles returns the bundle-relative paths git sees as changed in the
// working tree, sorted. It scopes `git status --porcelain` to the bundle subtree
// (pathspec) and strips the repo-root prefix from each path so the result is
// bundle-relative — correct whether the bundle is the repo root or a
// subdirectory, and directly usable by /author/discard (which runs checkout from
// the bundle dir). This is read-only.
func (s *Server) changedBundleFiles() ([]string, error) {
	top, prefix, err := repoRootAndPrefix(s.bundleDir)
	if err != nil {
		return nil, err
	}
	slashPrefix := filepath.ToSlash(prefix) // "" at repo root, else "sub/dir/"
	args := []string{"-C", top, "status", "--porcelain"}
	if slashPrefix != "" {
		args = append(args, "--", slashPrefix)
	}
	out, err := exec.Command("git", args...).Output()
	if err != nil {
		return nil, err
	}
	var files []string
	for _, line := range strings.Split(string(out), "\n") {
		if len(line) < 4 {
			continue
		}
		// porcelain v1: XY<space>path  (path begins at column 3). Renames carry
		// "orig -> new"; take the destination.
		path := strings.TrimSpace(line[3:])
		if i := strings.Index(path, " -> "); i >= 0 {
			path = path[i+len(" -> "):]
		}
		path = strings.Trim(path, "\"")
		// Paths are repo-root-relative; make them bundle-relative.
		path = strings.TrimPrefix(path, slashPrefix)
		if path != "" {
			files = append(files, path)
		}
	}
	sort.Strings(files)
	return files, nil
}

// publishGraph re-runs the deterministic graph + validate and fans the fresh
// state out over SSE so the UI canvas refreshes after an author run or discard.
func (s *Server) publishGraph() {
	if g, err := validate.Graph(s.bundleDir, s.cfg, graphx.Options{Body: "excerpt"}); err == nil {
		var sb strings.Builder
		if err := graphx.JSON(&sb, g); err == nil {
			s.bcast.Publish(Event{Name: "graph", Data: sb.String()})
		}
	}
	findings := validate.Validate(s.bundleDir, s.cfg)
	errs, warns := model.CountBySeverity(findings)
	s.bcast.Publish(Event{Name: "validate", Data: jsonStr(map[string]int{
		"errors":   errs,
		"warnings": warns,
	})})
}

func jsonStr(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// filepathToSlash normalizes OS separators to forward slashes for segment checks
// without pulling path/filepath into the rest of this file's surface.
func filepathToSlash(p string) string {
	return strings.ReplaceAll(p, "\\", "/")
}
