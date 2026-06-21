// Package validate is the rules engine (Layer 2). It runs per-document checks
// (2a), resolves the typed-link graph (2b), and applies the completeness rules
// for the Requirement -> Task -> Code -> Test chain. The only chain-specific
// coupling lives in config.ChainConfig; everything else is data-driven.
package validate

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/okf"
	"github.com/PurnaOS/iBuildOS/internal/types"
)

// artifact is a discovered bundle document under validation.
type artifact struct {
	doc     *okf.Document
	path    string // bundle-relative, slash-separated (for findings)
	rootRel string // /work/task-0001.md — the canonical graph key
	typ     string
	status  string
	links   map[string][]rlink // populated by buildGraph
}

// rlink is a resolved typed link.
type rlink struct {
	raw        string
	key        string // canonical /root-relative key
	line       int
	targetType string
	exists     bool
}

func (a *artifact) idOrPath() string {
	if a.doc != nil {
		if _, v, ok := a.doc.Get("id"); ok && v.Value != "" {
			return v.Value
		}
	}
	return a.path
}

// Validate runs the full pipeline over the bundle and returns sorted, deduped findings.
func Validate(bundleDir string, cfg config.Config) []model.Finding {
	c := &model.Collector{}

	reg, arts, err := loadArtifacts(bundleDir, cfg, c)
	if err != nil {
		c.Errf(cfg.BundleRel(cfg.TypesDir()), 0, "types.loadDir",
			"cannot read types directory %q: %v", cfg.TypesDir(), err)
		return model.Finalize(c.Items)
	}

	for _, a := range arts {
		validateDoc(a, reg, c)
		validateCode(a, reg, cfg, c)
	}
	g := buildGraph(arts, reg, cfg, c)
	completeness(arts, g, reg, cfg, c)

	return model.Finalize(c.Items)
}

// loadArtifacts loads the type registry and discovers + parses every artifact
// under the bundle's globs. It is the shared front half of both Validate and the
// graph export; it emits only read/parse findings via c. An unreadable types
// directory is returned as a hard error (the caller decides how to surface it).
func loadArtifacts(bundleDir string, cfg config.Config, c *model.Collector) (*types.Registry, []*artifact, error) {
	reg, err := types.Load(cfg.TypesDir(), bundleDir, c)
	if err != nil {
		return nil, nil, err
	}

	files, err := okf.MatchFiles(cfg.RootDir(), cfg.Artifacts)
	if err != nil {
		c.Errf(cfg.Root, 0, "config.badGlob", "invalid artifacts glob: %v", err)
	}

	var arts []*artifact
	for _, rel := range files {
		// OKF concepts are markdown. A glob like requirements/** also matches
		// stray non-.md files (.gitkeep, .DS_Store); tolerate them by skipping
		// rather than flagging them as type-less artifacts.
		if !strings.HasSuffix(rel, ".md") {
			continue
		}
		abs := filepath.Join(cfg.RootDir(), rel)
		a := &artifact{path: cfg.BundleRel(abs), rootRel: cfg.RootRel(abs)}
		raw, rerr := os.ReadFile(abs)
		if rerr != nil {
			c.Errf(a.path, 0, "doc.read", "cannot read file: %v", rerr)
			continue
		}
		d, perr := okf.Parse(abs, raw)
		a.doc = d
		if perr != nil {
			c.Errf(a.path, 0, "doc.parse", "%v", perr)
		}
		if d.HasFrontmatter {
			if _, tv, ok := d.Get("type"); ok {
				a.typ = tv.Value
			}
			if _, sv, ok := d.Get("status"); ok {
				a.status = sv.Value
			}
		}
		arts = append(arts, a)
	}
	return reg, arts, nil
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func sortedKeys[T any](m map[string]T) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
