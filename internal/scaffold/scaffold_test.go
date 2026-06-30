package scaffold

import (
	"bytes"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/validate"
)

func countErrors(findings []model.Finding) int {
	n, _ := model.CountBySeverity(findings)
	return n
}

// TestEmbedHasTypeDefs guards the go:embed `all:` gotcha — both type profiles and
// the dotfiles must actually be in the embedded FS.
func TestEmbedHasTypeDefs(t *testing.T) {
	for _, p := range []string{
		"templates/ibuildos.yaml",
		"templates/profiles/core/task.md",
		"templates/profiles/core/requirement.md",
		"templates/profiles/full/functional-requirement.md",
		"templates/profiles/full/change.md",
		"templates/docs/requirements/.gitkeep",
	} {
		if _, err := templatesFS.ReadFile(p); err != nil {
			t.Errorf("embedded FS missing %s: %v", p, err)
		}
	}
}

// claudeMirror maps each embedded templates/.claude path to its plugin/ source
// of truth. settings.json is the plugin hooks.json verbatim.
func claudeSource(rel string) string {
	switch {
	case rel == ".claude/settings.json":
		return "../../plugin/hooks/hooks.json"
	case strings.HasPrefix(rel, ".claude/skills/"):
		return "../../plugin/skills/" + strings.TrimPrefix(rel, ".claude/skills/")
	case strings.HasPrefix(rel, ".claude/agents/"):
		return "../../plugin/agents/" + strings.TrimPrefix(rel, ".claude/agents/")
	}
	return ""
}

// TestClaudeMirror is the drift gate: the vendored .claude/ tree init writes
// must be byte-identical to plugin/ (its single source of truth). Edit plugin/,
// then `go generate ./internal/scaffold`. Also asserts every plugin skill/agent
// made it into the mirror, so a newly added skill can't be silently dropped.
func TestClaudeMirror(t *testing.T) {
	// Every embedded .claude file matches its plugin source.
	mirrored := map[string]bool{}
	fs.WalkDir(templatesFS, "templates/.claude", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel := strings.TrimPrefix(p, "templates/")
		src := claudeSource(rel)
		if src == "" {
			t.Errorf("mirror has unmapped file %s — update claudeSource or the generator", rel)
			return nil
		}
		want, rerr := os.ReadFile(src)
		if rerr != nil {
			t.Errorf("plugin source missing for %s: %v", rel, rerr)
			return nil
		}
		got, _ := templatesFS.ReadFile(p)
		if !bytes.Equal(got, want) {
			t.Errorf("%s drifted from %s — run `go generate ./internal/scaffold`", rel, src)
		}
		mirrored[src] = true
		return nil
	})

	// Every plugin skill/agent is present in the mirror (no silent drops).
	for _, root := range []string{"../../plugin/skills", "../../plugin/agents"} {
		filepath.Walk(root, func(p string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return err
			}
			if !mirrored[p] {
				t.Errorf("plugin file %s not in vendored .claude — run `go generate ./internal/scaffold`", p)
			}
			return nil
		})
	}
}

func validateClean(t *testing.T, dir string) []model.Finding {
	t.Helper()
	cfg, err := config.Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	return validate.Validate(dir, cfg)
}

// TestInitRoundTrip is the headline gate for init: a freshly scaffolded bundle
// passes validate with zero errors. The default profile is the lean core.
func TestInitRoundTrip(t *testing.T) {
	dir := t.TempDir()
	res, err := Init(dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Created) == 0 || res.AlreadyInit {
		t.Fatalf("fresh init should create files and not be AlreadyInit: %+v", res)
	}
	if _, err := os.Stat(filepath.Join(dir, ".ibuildos.yaml")); err != nil {
		t.Errorf(".ibuildos.yaml not written: %v", err)
	}
	// core profile present, full-only types absent
	if _, err := os.Stat(filepath.Join(dir, "docs/types/task.md")); err != nil {
		t.Errorf("core type task.md not written: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "docs/types/epic.md")); err == nil {
		t.Errorf("core profile should not include epic.md")
	}
	if n := countErrors(validateClean(t, dir)); n != 0 {
		t.Fatalf("scaffolded bundle should validate clean, got %d errors", n)
	}
}

// TestInitFullProfile: --full scaffolds the complete taxonomy and still validates.
func TestInitFullProfile(t *testing.T) {
	dir := t.TempDir()
	if _, err := Init(dir, Options{Full: true}); err != nil {
		t.Fatal(err)
	}
	for _, f := range []string{"epic.md", "functional-requirement.md", "change.md", "scenario.md"} {
		if _, err := os.Stat(filepath.Join(dir, "docs/types", f)); err != nil {
			t.Errorf("full profile missing %s: %v", f, err)
		}
	}
	if n := countErrors(validateClean(t, dir)); n != 0 {
		t.Fatalf("--full bundle should validate clean, got %d errors", n)
	}
}

func TestInitExampleRoundTrip(t *testing.T) {
	dir := t.TempDir()
	if _, err := Init(dir, Options{Example: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, exampleReqPath)); err != nil {
		t.Errorf("example requirement not written: %v", err)
	}
	if n := countErrors(validateClean(t, dir)); n != 0 {
		t.Fatalf("--example bundle should validate clean, got %d errors", n)
	}
}

// TestInitIdempotent: re-running creates nothing new and never overwrites a
// user's edits.
func TestInitIdempotent(t *testing.T) {
	dir := t.TempDir()
	if _, err := Init(dir, Options{}); err != nil {
		t.Fatal(err)
	}

	// User edits the config; a second init must not clobber it.
	sentinel := []byte("root: docs\n# user edit\n")
	cfgPath := filepath.Join(dir, ".ibuildos.yaml")
	if err := os.WriteFile(cfgPath, sentinel, 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := Init(dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if !res.AlreadyInit {
		t.Error("second init should report AlreadyInit")
	}
	if len(res.Created) != 0 {
		t.Errorf("second init should create nothing, created %v", res.Created)
	}
	got, _ := os.ReadFile(cfgPath)
	if string(got) != string(sentinel) {
		t.Errorf("init overwrote a user-edited file:\n%s", got)
	}
}
