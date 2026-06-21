package validate

import (
	"github.com/PurnaOS/iBuildOS/internal/config"
	"github.com/PurnaOS/iBuildOS/internal/model"
	"github.com/PurnaOS/iBuildOS/internal/types"
)

// completeness applies the orphan / chain rules for Requirement -> Task -> Code
// -> Test. Capability predicates are derived from the type graph (e.g. "is a
// requirement" = is-or-extends the target of the `implements` relationship) so
// no type-name literal appears here.
func completeness(arts []*artifact, g *graph, reg *types.Registry, cfg config.Config, c *model.Collector) {
	ch := cfg.Chain
	reqTypes := reg.RelTargets(ch.ImplementsRel)
	isRequirement := func(t string) bool { return reg.SatisfiesAny(t, reqTypes) }

	for _, a := range arts {
		if a.typ == "" {
			continue
		}
		res, ok := reg.Resolve(a.typ)
		if !ok || res.Abstract {
			continue
		}

		if isRequirement(a.typ) {
			implemented := len(g.implementersOf[a.rootRel]) > 0
			verified := len(g.verifiersOf[a.rootRel]) > 0
			switch {
			case contains(ch.ActiveReqStatuses, a.status):
				if !implemented {
					c.Errf(a.path, a.doc.FrontStartLine(), "chain.reqNotImplemented",
						"requirement %q is %q but nothing implements it (no Story, Epic, or Task links to it)", a.idOrPath(), a.status)
				}
				if !verified {
					c.Errf(a.path, a.doc.FrontStartLine(), "chain.reqNoTest",
						"requirement %q is %q but no test verifies it", a.idOrPath(), a.status)
				}
			case contains(ch.ProposedStatuses, a.status):
				if !implemented {
					c.Warnf(a.path, a.doc.FrontStartLine(), "chain.proposedReqUnimplemented",
						"proposed requirement %q has nothing implementing it yet", a.idOrPath())
				}
			}
		}

		// Done-task rules apply to any "task-like" type: one that declares the code field.
		if _, taskLike := res.Fields[ch.CodeField]; taskLike && contains(ch.DoneStatuses, a.status) {
			checkDoneTask(a, g, reg, cfg, c)
		}
	}
}

func checkDoneTask(a *artifact, g *graph, reg *types.Registry, cfg config.Config, c *model.Collector) {
	ch := cfg.Chain
	line := a.doc.FrontStartLine()

	if len(scalarListField(a, ch.CodeField)) == 0 {
		c.Errf(a.path, line, "chain.doneTaskNoCode", "task %q is done but declares no code globs", a.idOrPath())
	}

	vb := a.links[ch.VerifiedByRel]
	if len(vb) == 0 {
		c.Errf(a.path, line, "chain.doneTaskTestNotPassing", "task %q is done but no test verifies it", a.idOrPath())
	} else {
		for _, rl := range vb {
			if !rl.exists {
				continue // already reported as link.unresolved
			}
			t := g.byKey[rl.key]
			st := "unknown"
			if t != nil {
				st = t.status
			}
			if t == nil || !contains(ch.PassingStatuses, st) {
				c.Errf(a.path, line, "chain.doneTaskTestNotPassing",
					"task %q is done but test %q is %q (expected passing)", a.idOrPath(), rl.raw, st)
			}
		}
	}

	// Traceability: must implement a requirement directly, or via a parent that does.
	reqTypes := reg.RelTargets(ch.ImplementsRel)
	implementsReq := func(links []rlink) bool {
		for _, rl := range links {
			if rl.exists && reg.SatisfiesAny(rl.targetType, reqTypes) {
				return true
			}
		}
		return false
	}
	direct := implementsReq(a.links[ch.ImplementsRel])
	viaParent := false
	parentUnresolved := false
	for _, rl := range a.links[ch.ParentRel] {
		if !rl.exists {
			parentUnresolved = true
			continue
		}
		if p := g.byKey[rl.key]; p != nil && implementsReq(p.links[ch.ImplementsRel]) {
			viaParent = true
		}
	}
	if !direct && !viaParent && !parentUnresolved {
		c.Errf(a.path, line, "chain.doneTaskUntraced",
			"task %q is done but neither implements a requirement directly nor has a parent that does", a.idOrPath())
	}
}
