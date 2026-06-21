package serve

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/graphx"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/validate"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, _ := os.Getwd()
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("go.mod not found")
		}
		dir = parent
	}
}

// gitBundle builds a self-contained temp git repo with a tiny OKF bundle: the
// repo's real docs/types (so the dialect is exactly the production one) plus the
// given artifacts under docs/. Everything is committed so HEAD is clean — the
// shadow worktrees check out HEAD. Returns the bundle dir (== repo top, since
// the bundle is the repo root here) and its config.
func gitBundle(t *testing.T, artifacts map[string]string) (string, config.Config) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	dir := t.TempDir()

	// .ibuildos.yaml (defaults: root docs, types types)
	write(t, dir, ".ibuildos.yaml", "root: docs\ntypes: types\nartifacts:\n  - requirements/**\n  - work/**\n  - tests/**\ncode_field: code\n")

	// copy real docs/types
	srcTypes := filepath.Join(repoRoot(t), "docs", "types")
	dstTypes := filepath.Join(dir, "docs", "types")
	if err := os.MkdirAll(dstTypes, 0o755); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(srcTypes)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		b, err := os.ReadFile(filepath.Join(srcTypes, e.Name()))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dstTypes, e.Name()), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}

	for p, content := range artifacts {
		write(t, dir, filepath.Join("docs", filepath.FromSlash(p)), content)
	}

	gitInit(t, dir)

	cfg, err := config.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	return dir, cfg
}

func write(t *testing.T, dir, rel, content string) {
	t.Helper()
	full := filepath.Join(dir, rel)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func gitInit(t *testing.T, dir string) {
	t.Helper()
	runGit(t, dir, "init", "-q")
	runGit(t, dir, "config", "user.email", "test@example.com")
	runGit(t, dir, "config", "user.name", "Test")
	runGit(t, dir, "add", "-A")
	runGit(t, dir, "commit", "-q", "-m", "initial")
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %s: %v: %s", strings.Join(args, " "), err, out)
	}
}

// --- fixtures ---------------------------------------------------------------

// A FunctionalRequirement (accepted) plus a Task that does NOT yet implement it
// and a Test that does NOT yet verify it. This bundle has chain errors (the
// requirement is unimplemented + unverified), which the ops below resolve.
func unlinkedBundle() map[string]string {
	return map[string]string{
		"requirements/fr-0001.md": "---\ntype: FunctionalRequirement\nid: FR-0001\ntitle: A behaviour\nstatus: accepted\n---\nThe system shall behave.\n",
		"work/task-0001.md":       "---\ntype: Task\nid: TASK-0001\ntitle: Do the thing\nstatus: todo\n---\nWork.\n",
		"tests/test-thing.md":     "---\ntype: Test\nid: TEST-thing\ntitle: Verifies the behaviour\nstatus: passing\nlinks:\n  verifies: [/requirements/fr-0001.md]\n---\nCheck.\n",
	}
}

// --- read-endpoint smoke tests ----------------------------------------------

func newTestServer(t *testing.T) (*httptest.Server, string, config.Config) {
	t.Helper()
	dir, cfg := gitBundle(t, unlinkedBundle())
	srv := httptest.NewServer(New(dir, cfg, "test").Handler())
	t.Cleanup(srv.Close)
	return srv, dir, cfg
}

func get(t *testing.T, base, path string) (*http.Response, []byte) {
	t.Helper()
	resp, err := http.Get(base + path)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	return resp, body
}

func TestAgentsMDEndpoint(t *testing.T) {
	srv, _, _ := newTestServer(t)
	resp, body := get(t, srv.URL, "/agents.md")
	if resp.StatusCode != 200 {
		t.Fatalf("agents.md: %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/markdown") {
		t.Errorf("agents.md content-type = %q, want text/markdown", ct)
	}
	if !bytes.Contains(body, []byte("# AGENTS.md")) {
		t.Errorf("agents.md body did not look like the contract doc: %q", body[:min(80, len(body))])
	}
	if !bytes.Contains(body, []byte("implements")) {
		t.Errorf("agents.md missing the default implements rel")
	}
}

func TestCatalogEndpoint(t *testing.T) {
	srv, _, _ := newTestServer(t)
	resp, body := get(t, srv.URL, "/catalog")
	if resp.StatusCode != 200 {
		t.Fatalf("catalog: %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("catalog content-type = %q, want application/json", ct)
	}
	var cat catalogResponse
	if err := json.Unmarshal(body, &cat); err != nil {
		t.Fatalf("catalog not JSON: %v", err)
	}
	if cat.Generator != "iBuild serve" {
		t.Errorf("catalog generator = %q", cat.Generator)
	}
	if len(cat.Endpoints) == 0 {
		t.Error("catalog has no endpoints")
	}
	// the catalog must advertise itself + the contract doc + the gate
	want := map[string]bool{"/catalog": false, "/agents.md": false, "/validate": false, "/graph": false}
	for _, e := range cat.Endpoints {
		if _, ok := want[e.Path]; ok {
			want[e.Path] = true
		}
	}
	for p, found := range want {
		if !found {
			t.Errorf("catalog missing endpoint %q", p)
		}
	}
	// endpoints sorted by (path, method) for byte-stability
	for i := 1; i < len(cat.Endpoints); i++ {
		a, b := cat.Endpoints[i-1], cat.Endpoints[i]
		if a.Path > b.Path || (a.Path == b.Path && a.Method > b.Method) {
			t.Errorf("catalog endpoints not sorted at %d: %q then %q", i, a.Path, b.Path)
		}
	}
	// chain vocabulary comes from the resolved config
	if cat.Chain.ImplementsRel != "implements" {
		t.Errorf("catalog chain.implementsRel = %q", cat.Chain.ImplementsRel)
	}
}

func TestHealthz(t *testing.T) {
	srv, _, _ := newTestServer(t)
	resp, body := get(t, srv.URL, "/healthz")
	if resp.StatusCode != 200 || string(body) != "ok" {
		t.Errorf("healthz: %d %q", resp.StatusCode, body)
	}
}

func TestGraphEndpoint(t *testing.T) {
	srv, _, _ := newTestServer(t)
	resp, body := get(t, srv.URL, "/graph")
	if resp.StatusCode != 200 {
		t.Fatalf("graph: %d", resp.StatusCode)
	}
	var g graphx.Graph
	if err := json.Unmarshal(body, &g); err != nil {
		t.Fatalf("graph not JSON: %v", err)
	}
	if len(g.Nodes) == 0 {
		t.Error("graph has no nodes")
	}
}

func TestValidateEndpoint(t *testing.T) {
	srv, _, _ := newTestServer(t)
	resp, body := get(t, srv.URL, "/validate")
	if resp.StatusCode != 200 {
		t.Fatalf("validate: %d", resp.StatusCode)
	}
	var v validateResponse
	if err := json.Unmarshal(body, &v); err != nil {
		t.Fatalf("validate not JSON: %v", err)
	}
	// The unlinked fixture has chain errors (req unimplemented).
	if v.Errors == 0 {
		t.Errorf("expected chain errors in unlinked bundle, got %d", v.Errors)
	}
}

func TestConfigEndpoint(t *testing.T) {
	srv, _, _ := newTestServer(t)
	resp, body := get(t, srv.URL, "/config")
	if resp.StatusCode != 200 {
		t.Fatalf("config: %d", resp.StatusCode)
	}
	var ch configResponse
	if err := json.Unmarshal(body, &ch); err != nil {
		t.Fatalf("config not JSON: %v", err)
	}
	if ch.ImplementsRel != "implements" {
		t.Errorf("config.implementsRel = %q, want implements", ch.ImplementsRel)
	}
	if len(ch.PassingStatuses) == 0 {
		t.Error("config.passingStatuses is empty")
	}
}

func TestFocusEndpoint(t *testing.T) {
	srv, _, _ := newTestServer(t)
	resp, body := get(t, srv.URL, "/focus?node=/requirements/fr-0001.md&depth=1")
	if resp.StatusCode != 200 {
		t.Fatalf("focus: %d (%s)", resp.StatusCode, body)
	}
	var g graphx.Graph
	if err := json.Unmarshal(body, &g); err != nil {
		t.Fatalf("focus not JSON: %v", err)
	}
	found := false
	for _, n := range g.Nodes {
		if n.Key == "/requirements/fr-0001.md" {
			found = true
		}
	}
	if !found {
		t.Error("focus did not include the requested node")
	}
	// missing node param -> 400
	if r, _ := get(t, srv.URL, "/focus"); r.StatusCode != 400 {
		t.Errorf("focus without node: %d, want 400", r.StatusCode)
	}
}

func TestIndexEndpoint(t *testing.T) {
	srv, _, _ := newTestServer(t)
	resp, body := get(t, srv.URL, "/")
	if resp.StatusCode != 200 {
		t.Fatalf("index: %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("index content-type = %q", ct)
	}
	if !bytes.Contains(body, []byte("<html")) && !bytes.Contains(body, []byte("<!doctype")) && !bytes.Contains(body, []byte("<!DOCTYPE")) {
		t.Error("index did not look like HTML")
	}
}

func TestEventsEmitsReady(t *testing.T) {
	srv, _, _ := newTestServer(t)
	req, _ := http.NewRequest("GET", srv.URL+"/events", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("events content-type = %q", ct)
	}
	buf := make([]byte, 64)
	n, _ := resp.Body.Read(buf)
	if !strings.Contains(string(buf[:n]), "event: ready") {
		t.Errorf("first SSE frame = %q, want a ready event", buf[:n])
	}
}

// --- simulate endpoint + the byte-identical property ------------------------

func postSimulate(t *testing.T, base string, ops []Op) (*http.Response, SimulateResult) {
	t.Helper()
	body, _ := json.Marshal(simulateRequest{Ops: ops})
	resp, err := http.Post(base+"/simulate", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /simulate: %v", err)
	}
	raw, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	var res SimulateResult
	if resp.StatusCode == 200 {
		if err := json.Unmarshal(raw, &res); err != nil {
			t.Fatalf("simulate response not JSON: %v (%s)", err, raw)
		}
	}
	return resp, res
}

func TestSimulateResolvesChainErrors(t *testing.T) {
	srv, _, _ := newTestServer(t)
	// Link the task to the requirement and mark it done with code+test. This
	// should resolve the chain.reqNotImplemented error.
	ops := []Op{
		{Op: "add-link", Key: "/work/task-0001.md", Rel: "implements", To: "/requirements/fr-0001.md"},
		{Op: "add-link", Key: "/work/task-0001.md", Rel: "verified_by", To: "/tests/test-thing.md"},
	}
	resp, res := postSimulate(t, srv.URL, ops)
	if resp.StatusCode != 200 {
		t.Fatalf("simulate: %d", resp.StatusCode)
	}
	// reqNotImplemented should be among the resolved findings.
	resolved := ruleSet(res.ResolvedFindings)
	if !resolved["chain.reqNotImplemented"] {
		t.Errorf("expected chain.reqNotImplemented resolved; resolved = %v", ruleList(res.ResolvedFindings))
	}
	if res.ErrorDelta >= 0 {
		t.Errorf("expected negative errorDelta after linking, got %d", res.ErrorDelta)
	}
	if res.TraceScoreAfter <= res.TraceScoreBefore {
		t.Errorf("expected trace score to rise: before=%v after=%v", res.TraceScoreBefore, res.TraceScoreAfter)
	}
}

func TestSimulateRejectsUnknownOp(t *testing.T) {
	srv, _, _ := newTestServer(t)
	resp, _ := postSimulate(t, srv.URL, []Op{{Op: "rewrite-prose", Key: "/work/task-0001.md"}})
	if resp.StatusCode != 400 {
		t.Errorf("unknown op: %d, want 400", resp.StatusCode)
	}
}

func TestSimulateRejectsNonGet(t *testing.T) {
	srv, _, _ := newTestServer(t)
	resp, _ := get(t, srv.URL, "/simulate")
	if resp.StatusCode != 405 {
		t.Errorf("GET /simulate: %d, want 405", resp.StatusCode)
	}
}

// TestSimulateByteIdentical is THE property: the post-state findings simulate
// predicts equal the findings a real commit of the same ops produces. We apply
// the ops to a real clone, commit, and run validate.Validate there, then compare
// to simulate's internal after-snapshot (HEAD+ops).
func TestSimulateByteIdentical(t *testing.T) {
	cases := []struct {
		name string
		ops  []Op
	}{
		{"link-and-verify", []Op{
			{Op: "add-link", Key: "/work/task-0001.md", Rel: "implements", To: "/requirements/fr-0001.md"},
		}},
		{"set-status", []Op{
			{Op: "set-status", Key: "/work/task-0001.md", To: "in_progress"},
		}},
		{"set-field", []Op{
			{Op: "set-field", Key: "/work/task-0001.md", Field: "owner", Value: "alice"},
		}},
		{"break-a-link", []Op{
			{Op: "add-link", Key: "/work/task-0001.md", Rel: "implements", To: "/requirements/does-not-exist.md"},
		}},
		{"multi-op", []Op{
			{Op: "add-link", Key: "/work/task-0001.md", Rel: "implements", To: "/requirements/fr-0001.md"},
			{Op: "add-link", Key: "/work/task-0001.md", Rel: "verified_by", To: "/tests/test-thing.md"},
			{Op: "set-field", Key: "/work/task-0001.md", Field: "code", Value: "internal/serve/*.go"},
			{Op: "set-status", Key: "/work/task-0001.md", To: "done"},
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir, cfg := gitBundle(t, unlinkedBundle())

			// Predicted after-state from the simulator.
			_, after, err := simulateSnapshots(dir, cfg, tc.ops)
			if err != nil {
				t.Fatalf("simulateSnapshots: %v", err)
			}
			predicted := after.findings

			// Real after-state: apply the same ops to the live bundle, commit,
			// run validate on the actually-edited tree.
			for _, op := range tc.ops {
				if err := applyOp(dir, cfg, op); err != nil {
					t.Fatalf("applyOp on real tree: %v", err)
				}
			}
			runGit(t, dir, "add", "-A")
			runGit(t, dir, "commit", "-q", "-m", "apply ops")
			real := validate.Validate(dir, cfg)

			if !reflect.DeepEqual(normFind(predicted), normFind(real)) {
				t.Errorf("simulate post-state != real post-state for %s\npredicted: %v\nreal:      %v",
					tc.name, normFind(predicted), normFind(real))
			}

			// And the graph must match too (byte-identical JSON).
			gReal, _ := validate.Graph(dir, cfg, graphx.Options{Body: "none"})
			var bReal bytes.Buffer
			graphx.JSON(&bReal, gReal)
			var bPred bytes.Buffer
			graphx.JSON(&bPred, after.graph)
			if bReal.String() != bPred.String() {
				t.Errorf("simulate post-graph != real post-graph for %s", tc.name)
			}
		})
	}
}

func TestSimulateRejectsPathEscape(t *testing.T) {
	dir, cfg := gitBundle(t, unlinkedBundle())
	_, err := Simulate(dir, cfg, []Op{
		{Op: "set-field", Key: "/../../etc/passwd", Field: "x", Value: "y"},
	})
	if err == nil {
		t.Error("expected simulate to reject a key escaping the bundle root")
	}
}

func TestListenLoopbackOnly(t *testing.T) {
	// Loopback addrs bind; a non-loopback addr is refused.
	ln, err := Listen("127.0.0.1:0")
	if err != nil {
		t.Fatalf("Listen 127.0.0.1:0: %v", err)
	}
	ln.Close()
	if _, err := Listen("0.0.0.0:0"); err == nil {
		t.Error("expected Listen to refuse 0.0.0.0")
	}
	if _, err := Listen("8.8.8.8:0"); err == nil {
		t.Error("expected Listen to refuse a public address")
	}
}

func TestSimulateNewlyBrokenLinks(t *testing.T) {
	dir, cfg := gitBundle(t, unlinkedBundle())
	res, err := Simulate(dir, cfg, []Op{
		{Op: "add-link", Key: "/work/task-0001.md", Rel: "implements", To: "/requirements/ghost.md"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.NewlyBrokenLinks) == 0 {
		t.Errorf("expected a newly broken link, got %v", res.NewlyBrokenLinks)
	}
}

// --- helpers ----------------------------------------------------------------

func ruleSet(fs []model.Finding) map[string]bool {
	m := map[string]bool{}
	for _, f := range fs {
		m[f.Rule] = true
	}
	return m
}

func ruleList(fs []model.Finding) []string {
	var out []string
	for _, f := range fs {
		out = append(out, f.Rule)
	}
	return out
}

// normFind returns a comparable, order-stable view of a finding list.
func normFind(fs []model.Finding) []model.Finding {
	out := model.Finalize(fs)
	if out == nil {
		return []model.Finding{}
	}
	return out
}
