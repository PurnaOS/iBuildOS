package validate

import (
	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/okf"
	"github.com/PurnaOS/iBuildOS/internal/types"
	"gopkg.in/yaml.v3"
)

// validateCode enforces the "Code" node of the chain: any artifact carrying the
// configured code field (default `code`) must have at least one glob match on
// disk. Globs are repo-relative (resolved against the bundle dir). Absence of
// the field is fine here — a done task that declares no code is handled by the
// completeness rules instead.
func validateCode(a *artifact, _ *types.Registry, cfg config.Config, c *model.Collector) {
	globs := scalarListField(a, cfg.Chain.CodeField)
	if len(globs) == 0 {
		return
	}
	kn, _, _ := a.doc.Get(cfg.Chain.CodeField)
	line := a.doc.Line(kn)
	matched, err := okf.AnyMatch(cfg.BundleDir, globs)
	if err != nil {
		c.Errf(a.path, line, "code.noMatch", "invalid code glob in %v: %v", globs, err)
		return
	}
	if !matched {
		c.Errf(a.path, line, "code.noMatch", "code globs %v matched no files on disk", globs)
	}
}

// scalarListField returns the string items of a list-valued frontmatter field,
// or nil if the field is absent or not a list.
func scalarListField(a *artifact, field string) []string {
	if a.doc == nil {
		return nil
	}
	_, vn, ok := a.doc.Get(field)
	if !ok || vn.Kind != yaml.SequenceNode {
		return nil
	}
	var out []string
	for _, item := range vn.Content {
		if item.Value != "" {
			out = append(out, item.Value)
		}
	}
	return out
}
