// Package serve is iBuild Studio's localhost HTTP surface — pure orchestration
// over the existing deterministic core. It computes NO findings of its own and
// imports nothing from the linter's decision path beyond calling the already
// exported Validate / Graph / Render. There is NO AI here and there are NO new
// module dependencies: stdlib net/http + os/exec + the existing internal
// packages only.
//
// Endpoints (all read endpoints are deterministic projections of the same funcs
// the CLI uses):
//
//	GET  /          text/html        site.Render of the current bundle
//	GET  /graph     application/json graphx.JSON of validate.Graph(Body:"excerpt")
//	GET  /validate  application/json findings + error/warning counts
//	GET  /focus     application/json graphx.Focus projection (?node&depth&rel)
//	GET  /config    application/json the resolved ChainConfig
//	GET  /agents.md text/markdown    contract.AgentsMD: the AGENTS.md contract
//	GET  /catalog   application/json machine catalog of this oracle's endpoints
//	GET  /healthz   text/plain       "ok"
//	GET  /events    text/event-stream a single "ready" event then heartbeats
//	POST /simulate  application/json the AI-free predictive diff (see simulate.go)
//
// The HISTORY phase is a deterministic, AI-free time-machine over committed git
// state — pure projections of the same Validate/Graph core through throwaway
// worktrees (see history.go):
//
//	GET  /history            application/json windowed log of commits touching the bundle
//	GET  /history/at         application/json Finalized graph + findings AS OF a commit
//	GET  /history/diff       application/json the /simulate diff shape, between two commits
//	GET  /history/staleness  application/json suspect links (source committed after target)
//
// One — and ONLY one — endpoint group is AI-touching: the AUTHOR phase, which
// drives a LOCAL Claude Code process to author OKF artifacts. It is suggest-only
// and NEVER commits (see author.go):
//
//	GET  /author/preflight application/json is `claude` on PATH? + version
//	POST /author           application/json run a headless /ibuild-* skill, stream to /events
//	GET  /author/diff      text/plain       the working-tree unified diff (read-only)
//	POST /author/discard   application/json `git checkout --` named paths (the only git mutation)
//
// The server binds 127.0.0.1 only; it is never exposed to 0.0.0.0.
package serve

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"sort"
	"time"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/contract"
	"github.com/PurnaOS/iBuildOS/internal/graphx"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/site"
	"github.com/PurnaOS/iBuildOS/internal/validate"
)

// Server is the localhost Studio server for a single bundle. It is orchestration
// only: every read handler delegates to validate/graphx/site, every write
// (simulate) delegates to the deterministic shadow-worktree engine. The single
// AI seam — the AUTHOR phase — is the injectable authorRunner field, which drives
// a local Claude Code process and writes nothing itself.
type Server struct {
	bundleDir string
	cfg       config.Config
	version   string
	bcast     *Broadcaster
	mux       *http.ServeMux

	// authorRunner is the ONLY non-deterministic, AI-touching seam. It runs a
	// headless Claude Code invocation in dir, streaming each output line to emit,
	// and returns the process exit code. Defaults to the real os/exec runner;
	// tests stub it so the suite never needs a live `claude`.
	authorRunner authorRunner

	// snaps memoizes HISTORY-phase commit snapshots keyed by tree sha so repeated
	// /history/at and windowed /history/diff requests skip re-validation. Per
	// process, unbounded for one session (see history.go).
	snaps *snapCache
}

// New builds a Server for a bundle. cfg should already carry any --types
// override the caller resolved. version is the build version surfaced by the
// contract endpoints (/agents.md, /catalog); an empty string defaults to "dev".
func New(bundleDir string, cfg config.Config, version string) *Server {
	if version == "" {
		version = "dev"
	}
	s := &Server{
		bundleDir:    bundleDir,
		cfg:          cfg,
		version:      version,
		bcast:        NewBroadcaster(),
		authorRunner: execAuthorRunner,
		snaps:        &snapCache{},
	}
	s.mux = http.NewServeMux()
	s.routes()
	return s
}

// Broadcaster is the in-process publish hook the AUTHOR phase will push to. It
// fans a stream of named SSE events out to every connected /events subscriber.
// Kept deliberately minimal — a slice of channels under a mutex, non-blocking
// sends so a slow client never wedges a publisher.
type Broadcaster struct {
	subscribe   chan chan Event
	unsubscribe chan chan Event
	publish     chan Event
}

// Event is one server-sent event: an SSE event name plus an opaque data string.
type Event struct {
	Name string
	Data string
}

// NewBroadcaster starts the fan-out loop and returns a ready Broadcaster.
func NewBroadcaster() *Broadcaster {
	b := &Broadcaster{
		subscribe:   make(chan chan Event),
		unsubscribe: make(chan chan Event),
		publish:     make(chan Event),
	}
	go b.loop()
	return b
}

func (b *Broadcaster) loop() {
	subs := map[chan Event]bool{}
	for {
		select {
		case ch := <-b.subscribe:
			subs[ch] = true
		case ch := <-b.unsubscribe:
			if subs[ch] {
				delete(subs, ch)
				close(ch)
			}
		case ev := <-b.publish:
			for ch := range subs {
				select {
				case ch <- ev: // non-blocking: drop for a slow subscriber
				default:
				}
			}
		}
	}
}

// Publish fans an event out to all current subscribers. Safe for concurrent use;
// later phases (AUTHOR) call this when the bundle changes on disk.
func (b *Broadcaster) Publish(ev Event) { b.publish <- ev }

// Broadcaster exposes the in-process hook so a host (or a test) can publish.
func (s *Server) Broadcaster() *Broadcaster { return s.bcast }

func (s *Server) routes() {
	s.mux.HandleFunc("/", s.handleIndex)
	s.mux.HandleFunc("/graph", s.handleGraph)
	s.mux.HandleFunc("/validate", s.handleValidate)
	s.mux.HandleFunc("/focus", s.handleFocus)
	s.mux.HandleFunc("/config", s.handleConfig)
	s.mux.HandleFunc("/agents.md", s.handleAgentsMD)
	s.mux.HandleFunc("/catalog", s.handleCatalog)
	s.mux.HandleFunc("/healthz", s.handleHealthz)
	s.mux.HandleFunc("/events", s.handleEvents)
	s.mux.HandleFunc("/simulate", s.handleSimulate)
	s.mux.HandleFunc("/history", s.handleHistory)
	s.mux.HandleFunc("/history/at", s.handleHistoryAt)
	s.mux.HandleFunc("/history/diff", s.handleHistoryDiff)
	s.mux.HandleFunc("/history/staleness", s.handleHistoryStaleness)
	s.mux.HandleFunc("/author/preflight", s.handleAuthorPreflight)
	s.mux.HandleFunc("/author/diff", s.handleAuthorDiff)
	s.mux.HandleFunc("/author/discard", s.handleAuthorDiscard)
	s.mux.HandleFunc("/author", s.handleAuthor)
}

// Handler exposes the routed mux (for httptest and embedding).
func (s *Server) Handler() http.Handler { return s.mux }

// Listen binds a localhost listener. addr must be a host:port; the host is
// forced to a loopback address — the server is never exposed beyond 127.0.0.1.
func Listen(addr string) (net.Listener, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, fmt.Errorf("invalid --addr %q (want host:port): %w", addr, err)
	}
	if !isLoopback(host) {
		return nil, fmt.Errorf("refusing to bind %q: iBuild serve is localhost-only (use 127.0.0.1)", host)
	}
	// An empty host ("" from a bare ":port") would make net.Listen bind 0.0.0.0
	// — every interface — so force it to a loopback literal. The localhost-only
	// guarantee depends on this rewrite, not just the isLoopback guard above.
	if host == "" {
		host = "127.0.0.1"
	}
	return net.Listen("tcp", net.JoinHostPort(host, port))
}

func isLoopback(host string) bool {
	switch host {
	case "", "localhost", "127.0.0.1", "::1":
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback()
	}
	return false
}

// Serve runs the HTTP server on the given listener until the listener closes.
func (s *Server) Serve(ln net.Listener) error {
	srv := &http.Server{Handler: s.mux}
	return srv.Serve(ln)
}

// --- read handlers (deterministic projections) ------------------------------

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	g, reg, err := validate.GraphWithRegistry(s.bundleDir, s.cfg, graphx.Options{Body: "excerpt"})
	if err != nil {
		httpError(w, http.StatusInternalServerError, "cannot build graph: %v", err)
		return
	}
	findings := validate.Validate(s.bundleDir, s.cfg)
	var buf bytes.Buffer
	if err := site.Render(&buf, g, findings, s.cfg, reg); err != nil {
		httpError(w, http.StatusInternalServerError, "cannot render site: %v", err)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(buf.Bytes())
}

func (s *Server) handleGraph(w http.ResponseWriter, r *http.Request) {
	g, err := validate.Graph(s.bundleDir, s.cfg, graphx.Options{Body: "excerpt"})
	if err != nil {
		httpError(w, http.StatusInternalServerError, "cannot build graph: %v", err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := graphx.JSON(w, g); err != nil {
		httpError(w, http.StatusInternalServerError, "cannot encode graph: %v", err)
	}
}

// validateResponse mirrors report.JSON's shape so /validate and `validate
// --format json` are the same contract.
type validateResponse struct {
	Errors   int             `json:"errors"`
	Warnings int             `json:"warnings"`
	Findings []model.Finding `json:"findings"`
}

func (s *Server) handleValidate(w http.ResponseWriter, r *http.Request) {
	findings := validate.Validate(s.bundleDir, s.cfg)
	errs, warns := model.CountBySeverity(findings)
	if findings == nil {
		findings = []model.Finding{}
	}
	writeJSON(w, http.StatusOK, validateResponse{Errors: errs, Warnings: warns, Findings: findings})
}

func (s *Server) handleFocus(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	node := q.Get("node")
	if node == "" {
		httpError(w, http.StatusBadRequest, "missing required ?node=<key>")
		return
	}
	depth := 1
	if d := q.Get("depth"); d != "" {
		n, err := parseNonNegInt(d)
		if err != nil {
			httpError(w, http.StatusBadRequest, "invalid depth %q: %v", d, err)
			return
		}
		depth = n
	}
	rels := splitComma(q.Get("rel"))

	// Build the whole graph deterministically, then project — identical to
	// `iBuild graph --node ... --depth ... --rel ...`.
	g, err := validate.Graph(s.bundleDir, s.cfg, graphx.Options{Body: "excerpt"})
	if err != nil {
		httpError(w, http.StatusInternalServerError, "cannot build graph: %v", err)
		return
	}
	focused := graphx.Focus(g, node, depth, rels)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := graphx.JSON(w, focused); err != nil {
		httpError(w, http.StatusInternalServerError, "cannot encode graph: %v", err)
	}
}

// configResponse projects the resolved ChainConfig with explicit, stable JSON
// keys (the same camelCase the site view-model uses), so the UI consumes the
// chain vocabulary as data and never hardcodes a relationship or status name.
// config.ChainConfig itself carries only yaml tags (load-bearing for parsing),
// so we project rather than marshal it directly.
type configResponse struct {
	ImplementsRel     string   `json:"implementsRel"`
	VerifiesRel       string   `json:"verifiesRel"`
	VerifiedByRel     string   `json:"verifiedByRel"`
	ParentRel         string   `json:"parentRel"`
	CodeField         string   `json:"codeField"`
	ActiveReqStatuses []string `json:"activeReqStatuses"`
	ProposedStatuses  []string `json:"proposedStatuses"`
	DoneStatuses      []string `json:"doneStatuses"`
	PassingStatuses   []string `json:"passingStatuses"`
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	ch := s.cfg.Chain
	writeJSON(w, http.StatusOK, configResponse{
		ImplementsRel:     ch.ImplementsRel,
		VerifiesRel:       ch.VerifiesRel,
		VerifiedByRel:     ch.VerifiedByRel,
		ParentRel:         ch.ParentRel,
		CodeField:         ch.CodeField,
		ActiveReqStatuses: ch.ActiveReqStatuses,
		ProposedStatuses:  ch.ProposedStatuses,
		DoneStatuses:      ch.DoneStatuses,
		PassingStatuses:   ch.PassingStatuses,
	})
}

// handleAgentsMD serves the AGENTS.md contract document for the served bundle as
// text/markdown — the same bytes `iBuild agents` emits. It is a deterministic
// projection of the resolved ChainConfig (taxonomy-blind) plus the build version.
func (s *Server) handleAgentsMD(w http.ResponseWriter, r *http.Request) {
	doc := contract.AgentsMD(s.cfg, s.version)
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	io.WriteString(w, doc)
}

// catalogEndpoint describes one HTTP surface of the serve oracle.
type catalogEndpoint struct {
	Method      string `json:"method"`
	Path        string `json:"path"`
	Description string `json:"description"`
}

// catalogResponse is the machine catalog of the serve oracle: a stable,
// self-describing manifest so an agent can discover the read/simulate/author
// surface programmatically. The chain projection reuses configResponse so the
// vocabulary stays data-driven (every name comes from cfg.Chain).
type catalogResponse struct {
	Generator string            `json:"generator"`
	Version   string            `json:"version"`
	Endpoints []catalogEndpoint `json:"endpoints"`
	Chain     configResponse    `json:"chain"`
}

// handleCatalog serves a deterministic machine catalog of the serve oracle. The
// endpoint list is declared statically (no map ranged for output) and sorted by
// (path, method) so the JSON is byte-stable across runs.
func (s *Server) handleCatalog(w http.ResponseWriter, r *http.Request) {
	endpoints := []catalogEndpoint{
		{"GET", "/", "iBuild Studio UI: site.Render of the current bundle (text/html)"},
		{"GET", "/graph", "typed link graph as JSON (the fast-context oracle)"},
		{"GET", "/validate", "deterministic findings plus error/warning counts"},
		{"GET", "/focus", "graph neighborhood projection (?node&depth&rel)"},
		{"GET", "/config", "the resolved ChainConfig vocabulary as JSON"},
		{"GET", "/agents.md", "AGENTS.md contract surface (text/markdown)"},
		{"GET", "/catalog", "this machine catalog of the serve oracle"},
		{"GET", "/healthz", "liveness probe (text/plain ok)"},
		{"GET", "/events", "server-sent event stream of bundle changes"},
		{"POST", "/simulate", "AI-free predictive diff for a set of edit ops"},
		{"GET", "/history", "windowed log of commits touching the bundle"},
		{"GET", "/history/at", "graph + findings as of a commit"},
		{"GET", "/history/diff", "predictive diff shape between two commits"},
		{"GET", "/history/staleness", "links whose source committed after the target"},
		{"GET", "/author/preflight", "is local Claude Code available? (suggest-only)"},
		{"POST", "/author", "run a headless ibuild authoring skill (suggest-only)"},
		{"GET", "/author/diff", "the working-tree unified diff (read-only)"},
		{"POST", "/author/discard", "git checkout -- named paths (the only git mutation)"},
	}
	sort.Slice(endpoints, func(i, j int) bool {
		if endpoints[i].Path != endpoints[j].Path {
			return endpoints[i].Path < endpoints[j].Path
		}
		return endpoints[i].Method < endpoints[j].Method
	})
	ch := s.cfg.Chain
	writeJSON(w, http.StatusOK, catalogResponse{
		Generator: "iBuild serve",
		Version:   s.version,
		Endpoints: endpoints,
		Chain: configResponse{
			ImplementsRel:     ch.ImplementsRel,
			VerifiesRel:       ch.VerifiesRel,
			VerifiedByRel:     ch.VerifiedByRel,
			ParentRel:         ch.ParentRel,
			CodeField:         ch.CodeField,
			ActiveReqStatuses: ch.ActiveReqStatuses,
			ProposedStatuses:  ch.ProposedStatuses,
			DoneStatuses:      ch.DoneStatuses,
			PassingStatuses:   ch.PassingStatuses,
		},
	})
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	io.WriteString(w, "ok")
}

// handleEvents is the SSE stream: emit one "ready" event immediately, then relay
// every broadcast event, with a heartbeat comment ~every 25s so proxies and
// browsers keep the connection open. Closes when the client disconnects.
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		httpError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	sub := make(chan Event, 8)
	s.bcast.subscribe <- sub
	defer func() { s.bcast.unsubscribe <- sub }()

	fmt.Fprintf(w, "event: ready\ndata: {}\n\n")
	flusher.Flush()

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		case ev, ok := <-sub:
			if !ok {
				return
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Name, ev.Data)
			flusher.Flush()
		}
	}
}

// --- helpers ----------------------------------------------------------------

func writeJSON(w http.ResponseWriter, code int, v any) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		httpError(w, http.StatusInternalServerError, "cannot encode response: %v", err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	w.Write(b)
	w.Write([]byte("\n"))
}

func httpError(w http.ResponseWriter, code int, format string, a ...any) {
	msg := fmt.Sprintf(format, a...)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	b, _ := json.Marshal(map[string]string{"error": msg})
	w.Write(b)
	w.Write([]byte("\n"))
}

func parseNonNegInt(s string) (int, error) {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, fmt.Errorf("not a non-negative integer")
		}
		n = n*10 + int(r-'0')
	}
	if s == "" {
		return 0, fmt.Errorf("empty")
	}
	return n, nil
}

func splitComma(s string) []string {
	var out []string
	cur := ""
	flush := func() {
		t := trimSpace(cur)
		if t != "" {
			out = append(out, t)
		}
		cur = ""
	}
	for _, r := range s {
		if r == ',' {
			flush()
			continue
		}
		cur += string(r)
	}
	flush()
	return out
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}
