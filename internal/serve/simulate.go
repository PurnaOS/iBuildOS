package serve

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/graphx"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/types"
	"github.com/PurnaOS/iBuildOS/internal/validate"
)

// Op is one mechanical, prose-free edit the simulator can apply to a document's
// YAML frontmatter. The vocabulary is deliberately tiny: anything that needs new
// files or body prose is the AUTHOR phase, not simulate.
//
//	{ "op": "set-status", "key": "/work/t.md", "to": "done" }
//	{ "op": "add-link",   "key": "/work/t.md", "rel": "implements", "to": "/requirements/fr-0001.md" }
//	{ "op": "set-field",  "key": "/work/t.md", "field": "owner", "value": "alice" }
type Op struct {
	Op    string `json:"op"`
	Key   string `json:"key"`
	To    string `json:"to,omitempty"`
	Rel   string `json:"rel,omitempty"`
	Field string `json:"field,omitempty"`
	Value string `json:"value,omitempty"`
}

// simulateRequest is the POST /simulate body.
type simulateRequest struct {
	Ops []Op `json:"ops"`
}

// SimulateResult is the deterministic predictive diff between HEAD and HEAD+ops.
// Every list is sorted so the response is byte-stable for a given op set.
type SimulateResult struct {
	NewFindings      []model.Finding `json:"newFindings"`
	ResolvedFindings []model.Finding `json:"resolvedFindings"`
	ErrorDelta       int             `json:"errorDelta"`
	ExitBefore       int             `json:"exitBefore"`
	ExitAfter        int             `json:"exitAfter"`
	TraceScoreBefore float64         `json:"traceScoreBefore"`
	TraceScoreAfter  float64         `json:"traceScoreAfter"`
	NewOrphans       []string        `json:"newOrphans"`
	NewlyBrokenLinks []string        `json:"newlyBrokenLinks"`
}

func (s *Server) handleSimulate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpError(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	var req simulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, http.StatusBadRequest, "invalid request JSON: %v", err)
		return
	}
	res, err := Simulate(s.bundleDir, s.cfg, req.Ops)
	if err != nil {
		httpError(w, http.StatusBadRequest, "%v", err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// Simulate predicts the linter diff a commit of ops would produce, with NO AI
// and NO findings of its own. The mechanics, chosen so the result is
// byte-identical to what CI would compute after committing the ops:
//
//  1. Create TWO detached worktrees of HEAD — a baseline and a shadow. Diffing
//     HEAD-vs-HEAD+ops (not working-tree-vs-ops) makes the result independent of
//     any uncommitted edits and exactly what a clean checkout + commit would see.
//  2. Apply each op to the shadow tree as a purely mechanical frontmatter edit.
//  3. Run validate.Validate + validate.Graph on both trees.
//  4. Diff the Finalized findings, error counts, exit codes, trace scores,
//     orphans, and broken links. Both worktrees are removed + pruned in a defer.
func Simulate(bundleDir string, cfg config.Config, ops []Op) (SimulateResult, error) {
	before, after, err := simulateSnapshots(bundleDir, cfg, ops)
	if err != nil {
		return SimulateResult{}, err
	}
	return diff(before, after), nil
}

// simulateSnapshots runs the full shadow-worktree mechanic and returns the
// before (HEAD) and after (HEAD+ops) snapshots. The exported Simulate diffs
// them; tests use it to assert the after-state is byte-identical to a real
// commit of the same ops.
func simulateSnapshots(bundleDir string, cfg config.Config, ops []Op) (before, after snap, err error) {
	for i, op := range ops {
		if e := validateOp(op); e != nil {
			return snap{}, snap{}, fmt.Errorf("ops[%d]: %w", i, e)
		}
	}

	absBundle, e := filepath.Abs(bundleDir)
	if e != nil {
		return snap{}, snap{}, fmt.Errorf("cannot resolve bundle dir: %w", e)
	}
	// Resolve symlinks so the path is comparable to git's toplevel: `git
	// rev-parse --show-toplevel` returns the real (symlink-free) path, and on
	// macOS $TMPDIR lives under /var -> /private/var. Without this the computed
	// relative path escapes the worktree and edits leak back into the source.
	if resolved, err := filepath.EvalSymlinks(absBundle); err == nil {
		absBundle = resolved
	}
	top, e := gitToplevel(absBundle)
	if e != nil {
		return snap{}, snap{}, fmt.Errorf("simulate needs a git repo: %w", e)
	}
	if resolved, err := filepath.EvalSymlinks(top); err == nil {
		top = resolved
	}
	bundleRel, e := filepath.Rel(top, absBundle)
	if e != nil {
		return snap{}, snap{}, fmt.Errorf("bundle is not inside the git repo: %w", e)
	}
	if strings.HasPrefix(bundleRel, "..") {
		return snap{}, snap{}, fmt.Errorf("bundle %q is not inside the git repo at %q", absBundle, top)
	}

	base, cleanupBase, e := addWorktree(top)
	if e != nil {
		return snap{}, snap{}, fmt.Errorf("cannot create baseline worktree: %w", e)
	}
	defer cleanupBase()
	shadow, cleanupShadow, e := addWorktree(top)
	if e != nil {
		return snap{}, snap{}, fmt.Errorf("cannot create shadow worktree: %w", e)
	}
	defer cleanupShadow()

	shadowBundle := filepath.Join(shadow, bundleRel)
	for i, op := range ops {
		if e := applyOp(shadowBundle, cfg, op); e != nil {
			return snap{}, snap{}, fmt.Errorf("ops[%d] (%s %s): %w", i, op.Op, op.Key, e)
		}
	}

	before = snapshot(cfgFor(cfg, filepath.Join(base, bundleRel)))
	after = snapshot(cfgFor(cfg, shadowBundle))
	return before, after, nil
}

// validateOp rejects malformed ops and anything outside the mechanical
// vocabulary (prose / new files belong to AUTHOR, not simulate).
func validateOp(op Op) error {
	if strings.TrimSpace(op.Key) == "" {
		return fmt.Errorf("missing %q", "key")
	}
	if !strings.HasPrefix(op.Key, "/") {
		return fmt.Errorf("key %q must be a /root-relative graph key", op.Key)
	}
	switch op.Op {
	case "set-status":
		if op.To == "" {
			return fmt.Errorf("set-status requires a non-empty %q", "to")
		}
	case "set-field":
		if op.Field == "" {
			return fmt.Errorf("set-field requires a %q", "field")
		}
		if op.Field == "links" || op.Field == "type" {
			return fmt.Errorf("set-field cannot touch reserved field %q (use add-link / set-status)", op.Field)
		}
	case "add-link":
		if op.Rel == "" {
			return fmt.Errorf("add-link requires a %q", "rel")
		}
		if op.To == "" || !strings.HasPrefix(op.To, "/") {
			return fmt.Errorf("add-link requires a /root-relative %q target", "to")
		}
	case "":
		return fmt.Errorf("missing %q", "op")
	default:
		return fmt.Errorf("unknown op %q (mechanical edits only: set-status, set-field, add-link; prose/new files are the AUTHOR phase)", op.Op)
	}
	return nil
}

// applyOp performs one mechanical frontmatter edit on the file the op's key maps
// to inside the shadow bundle. The edit is line-based and preserves the rest of
// the file byte-for-byte. The target file must already exist (no new files).
func applyOp(shadowBundle string, cfg config.Config, op Op) error {
	scoped := cfgFor(cfg, shadowBundle)
	root := filepath.Clean(scoped.RootDir())
	target := filepath.Clean(scoped.ResolveLink(op.Key))
	// Defense in depth: never let a crafted key escape the bundle root, even
	// inside the throwaway shadow tree.
	if target != root && !strings.HasPrefix(target, root+string(filepath.Separator)) {
		return fmt.Errorf("key %q escapes the bundle root", op.Key)
	}
	raw, err := os.ReadFile(target)
	if err != nil {
		return fmt.Errorf("cannot read %s: %w (simulate edits existing files only)", op.Key, err)
	}
	ed, err := newFMEditor(raw)
	if err != nil {
		return err
	}
	switch op.Op {
	case "set-status":
		ed.setScalar("status", op.To)
	case "set-field":
		ed.setScalar(op.Field, op.Value)
	case "add-link":
		ed.addLink(op.Rel, op.To)
	}
	return os.WriteFile(target, ed.bytes(), 0o644)
}

// cfgFor clones cfg with a new BundleDir (and keeps the --types override, since
// the shadow tree shares the same docs/types as HEAD).
func cfgFor(cfg config.Config, bundleDir string) config.Config {
	c := cfg
	c.BundleDir = bundleDir
	return c
}

// --- snapshot + diff --------------------------------------------------------

// snap is the linter's full output for one tree: findings, the graph, the
// compiled registry (for capability predicates in the trace score), and the
// resolved chain config so an alternate type set is honored without type names.
// loadError captures a non-fatal types/bundle load failure (e.g. a HISTORY
// commit predating the bundle) as DATA — the snapshot stays usable (empty graph)
// and callers surface the error rather than panicking. It is "" on the success
// path the simulator always walks (both worktrees are checkouts of HEAD).
type snap struct {
	findings  []model.Finding
	graph     graphx.Graph
	reg       *types.Registry
	chain     config.ChainConfig
	loadError string
}

func snapshot(cfg config.Config) snap {
	return snapshotBody(cfg, graphx.Options{Body: "none"})
}

// snapshotBody is snapshot with an explicit graph Body. The simulator uses
// Body:"none" (its diff never reads excerpts, and the byte-identical property
// compares against a Body:"none" export); the HISTORY phase passes Body:"excerpt"
// so /history/at returns the same excerpt-bearing graph the canvas renders. A
// non-fatal load failure (a commit predating the bundle) is captured as data.
func snapshotBody(cfg config.Config, opts graphx.Options) snap {
	findings := validate.Validate(cfg.BundleDir, cfg)
	g, reg, err := validate.GraphWithRegistry(cfg.BundleDir, cfg, opts)
	loadErr := ""
	if err != nil {
		g = graphx.Graph{}
		loadErr = err.Error()
	}
	return snap{findings: findings, graph: g, reg: reg, chain: cfg.Chain, loadError: loadErr}
}

func diff(before, after snap) SimulateResult {
	res := SimulateResult{}

	beforeSet := map[model.Finding]bool{}
	for _, f := range before.findings {
		beforeSet[f] = true
	}
	afterSet := map[model.Finding]bool{}
	for _, f := range after.findings {
		afterSet[f] = true
	}
	for _, f := range after.findings {
		if !beforeSet[f] {
			res.NewFindings = append(res.NewFindings, f)
		}
	}
	for _, f := range before.findings {
		if !afterSet[f] {
			res.ResolvedFindings = append(res.ResolvedFindings, f)
		}
	}
	res.NewFindings = model.Finalize(res.NewFindings)
	res.ResolvedFindings = model.Finalize(res.ResolvedFindings)

	errBefore, _ := model.CountBySeverity(before.findings)
	errAfter, _ := model.CountBySeverity(after.findings)
	res.ErrorDelta = errAfter - errBefore
	res.ExitBefore = exitFor(errBefore)
	res.ExitAfter = exitFor(errAfter)

	res.TraceScoreBefore = traceScore(before)
	res.TraceScoreAfter = traceScore(after)

	res.NewOrphans = newOrphans(before, after)
	res.NewlyBrokenLinks = newlyBrokenLinks(before, after)
	return res
}

func exitFor(errors int) int {
	if errors > 0 {
		return 1
	}
	return 0
}

// traceScore is the SAME deep-coverage % the site reports: the fraction of
// requirement-capable nodes that are both implemented (a resolved implements
// edge points at them) AND verified by a passing test (a resolved verifies edge
// from a node whose status is in PassingStatuses). The capability predicate is
// the data-driven one the linter uses everywhere: requirement-capable iff the
// node's type is-or-extends the target of the implements relationship. Returns
// 100 when there are no requirement-capable nodes (nothing to cover).
func traceScore(s snap) float64 {
	if s.reg == nil {
		return 100
	}
	ch := s.chain
	// Honor an alternate chain only through the registry, never type names.
	reqTypes := s.reg.RelTargets(ch.ImplementsRel)
	if len(reqTypes) == 0 {
		return 100
	}

	statusByKey := map[string]string{}
	for _, n := range s.graph.Nodes {
		statusByKey[n.Key] = n.Status
	}
	passing := map[string]bool{}
	for _, st := range ch.PassingStatuses {
		passing[st] = true
	}

	implemented := map[string]bool{} // requirement key -> has a resolved implements edge in
	verified := map[string]bool{}    // requirement key -> a passing test verifies it
	for _, e := range s.graph.Edges {
		if !e.Resolved {
			continue
		}
		switch e.Relationship {
		case ch.ImplementsRel:
			implemented[e.To] = true
		case ch.VerifiesRel:
			if passing[statusByKey[e.From]] {
				verified[e.To] = true
			}
		}
	}

	total, covered := 0, 0
	for _, n := range s.graph.Nodes {
		if n.Type == "" || !s.reg.SatisfiesAny(n.Type, reqTypes) {
			continue
		}
		total++
		if implemented[n.Key] && verified[n.Key] {
			covered++
		}
	}
	if total == 0 {
		return 100
	}
	return float64(covered*10000/total) / 100
}

// chainErrFiles returns the set of bundle-relative files that carry a chain.*
// error — the same predicate the site uses to mark a node "untraced".
func chainErrFiles(findings []model.Finding) map[string]bool {
	out := map[string]bool{}
	for _, f := range findings {
		if f.Severity == model.Error && strings.HasPrefix(f.Rule, "chain.") {
			out[f.File] = true
		}
	}
	return out
}

// newOrphans are requirement-capable nodes that become untraced (gain a chain.*
// error) only after the ops — i.e. the ops broke a previously-traced requirement.
func newOrphans(before, after snap) []string {
	if after.reg == nil {
		return nil
	}
	reqTypes := after.reg.RelTargets(after.chain.ImplementsRel)
	beforeErr := chainErrFiles(before.findings)
	afterErr := chainErrFiles(after.findings)
	var out []string
	for _, n := range after.graph.Nodes {
		if len(reqTypes) == 0 || n.Type == "" || !after.reg.SatisfiesAny(n.Type, reqTypes) {
			continue
		}
		if afterErr[n.Path] && !beforeErr[n.Path] {
			out = append(out, n.Key)
		}
	}
	sort.Strings(out)
	return dedupe(out)
}

// newlyBrokenLinks are link.unresolved errors present after the ops but not
// before, reported as "<file>:<line>" so a UI can jump to them.
func newlyBrokenLinks(before, after snap) []string {
	beforeBroken := map[string]bool{}
	for _, f := range before.findings {
		if f.Rule == "link.unresolved" {
			beforeBroken[brokenKey(f)] = true
		}
	}
	var out []string
	for _, f := range after.findings {
		if f.Rule == "link.unresolved" && !beforeBroken[brokenKey(f)] {
			out = append(out, fmt.Sprintf("%s:%d", f.File, f.Line))
		}
	}
	sort.Strings(out)
	return dedupe(out)
}

func brokenKey(f model.Finding) string {
	return fmt.Sprintf("%s:%d:%s", f.File, f.Line, f.Message)
}

func dedupe(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	out := in[:0]
	var last string
	for i, v := range in {
		if i == 0 || v != last {
			out = append(out, v)
		}
		last = v
	}
	return out
}

// --- git worktree mechanics -------------------------------------------------

func gitToplevel(dir string) (string, error) {
	cmd := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("git rev-parse failed: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// addWorktree creates a detached worktree of HEAD in a fresh temp dir and
// returns it plus a cleanup that removes and prunes it. It delegates to
// addWorktreeAt (history.go), the arbitrary-commit form, with ref="HEAD". The
// temp dir lives OUTSIDE the repo so it never pollutes discovery, and removal is
// forced so a dirty shadow tree still detaches cleanly.
func addWorktree(top string) (dir string, cleanup func(), err error) {
	return addWorktreeAt(top, "HEAD")
}
