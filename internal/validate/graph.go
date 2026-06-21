package validate

import (
	"os"
	"strings"

	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/okf"
	"github.com/PurnaOS/iBuildOS/internal/types"
)

// graph holds the resolved link graph and the reverse indexes the completeness
// rules query.
type graph struct {
	byKey          map[string]*artifact
	implementersOf map[string][]*artifact // requirement key -> docs that implement it
	verifiersOf    map[string][]*artifact // requirement key -> tests that verify it
}

// buildGraph resolves every declared relationship for every artifact: existence,
// target-type satisfaction, and cardinality. It populates each artifact's
// resolved links and the reverse indexes used by the chain rules.
func buildGraph(arts []*artifact, reg *types.Registry, cfg config.Config, c *model.Collector) *graph {
	g := &graph{
		byKey:          map[string]*artifact{},
		implementersOf: map[string][]*artifact{},
		verifiersOf:    map[string][]*artifact{},
	}
	for _, a := range arts {
		if a.rootRel != "" {
			g.byKey[a.rootRel] = a
		}
	}
	typeCache := map[string]string{} // link key -> type, for targets outside the artifact set

	for _, a := range arts {
		if a.doc == nil || !a.doc.HasFrontmatter || a.typ == "" {
			continue
		}
		res, ok := reg.Resolve(a.typ)
		if !ok || res.Abstract {
			continue
		}
		rawLinks := a.doc.Links()
		a.links = map[string][]rlink{}

		for _, relName := range sortedKeys(res.Rels) {
			spec := res.Rels[relName]
			refs := rawLinks[relName]
			fallbackLine := a.doc.FrontStartLine()
			if len(refs) > 0 {
				fallbackLine = refs[0].Line
			}
			if len(refs) < spec.Min {
				c.Errf(a.path, fallbackLine, "rel.minCardinality",
					"relationship %q requires at least %d link(s), found %d", relName, spec.Min, len(refs))
			}
			if spec.Max != nil && len(refs) > *spec.Max {
				c.Errf(a.path, fallbackLine, "rel.maxCardinality",
					"relationship %q allows at most %d link(s), found %d", relName, *spec.Max, len(refs))
			}
			for _, ref := range refs {
				rl := resolveLink(a, ref, spec, relName, reg, cfg, g, typeCache, c)
				a.links[relName] = append(a.links[relName], rl)
			}
		}

		// Unknown relationship keys under links: are tolerated with a warning.
		for relName, refs := range rawLinks {
			if _, declared := res.Rels[relName]; !declared {
				line := a.doc.FrontStartLine()
				if len(refs) > 0 {
					line = refs[0].Line
				}
				c.Warnf(a.path, line, "link.unknownRelationship",
					"relationship %q is not declared by type %q", relName, a.typ)
			}
		}

		// Reverse indexes for the chain completeness rules.
		for _, rl := range a.links[cfg.Chain.ImplementsRel] {
			if rl.exists {
				g.implementersOf[rl.key] = append(g.implementersOf[rl.key], a)
			}
		}
		for _, rl := range a.links[cfg.Chain.VerifiesRel] {
			if rl.exists {
				g.verifiersOf[rl.key] = append(g.verifiersOf[rl.key], a)
			}
		}
	}
	return g
}

func resolveLink(a *artifact, ref okf.LinkRef, spec types.RelSpec, relName string,
	reg *types.Registry, cfg config.Config, g *graph, cache map[string]string, c *model.Collector) rlink {

	rl := rlink{raw: ref.Raw, key: cfg.LinkKey(ref.Raw), line: ref.Line}
	diskPath := cfg.ResolveLink(ref.Raw)
	// Existence is checked case-sensitively (not os.Stat, which case-folds on
	// macOS/Windows) so a link to /work/Task.md does not resolve to task.md — and
	// the same bundle yields identical findings on every OS (review #2).
	rel := strings.TrimPrefix(ref.Raw, "/")
	if cfg.LinkEscapesRoot(diskPath) || !okf.PathCaseMatches(cfg.RootDir(), rel) {
		c.Errf(a.path, ref.Line, "link.unresolved",
			"%s link %q does not resolve to an existing document", relName, ref.Raw)
		return rl
	}
	rl.exists = true

	// Determine the target's type — even if it lives outside the artifact globs.
	if target, ok := g.byKey[rl.key]; ok {
		rl.targetType = target.typ
	} else if cached, ok := cache[rl.key]; ok {
		rl.targetType = cached
	} else {
		if raw, err := os.ReadFile(diskPath); err == nil {
			if d, err := okf.Parse(diskPath, raw); err == nil && d.HasFrontmatter {
				if _, tv, ok := d.Get("type"); ok {
					rl.targetType = tv.Value
				}
			}
		}
		cache[rl.key] = rl.targetType
	}

	if spec.Target != "" {
		switch {
		case rl.targetType == "" || !reg.Has(rl.targetType):
			c.Warnf(a.path, ref.Line, "link.unknownTargetType",
				"%s link %q points to a document of unknown type; target not checked", relName, ref.Raw)
		case !reg.Satisfies(rl.targetType, spec.Target):
			c.Errf(a.path, ref.Line, "link.wrongTarget",
				"%s link %q points to type %q; expected %s or a subtype", relName, ref.Raw, rl.targetType, spec.Target)
		}
	}
	return rl
}
