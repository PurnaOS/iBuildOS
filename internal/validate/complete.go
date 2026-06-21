package validate

import (
	"strings"

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

		reqLike := isRequirement(a.typ)
		_, taskLike := res.Fields[ch.CodeField]

		if reqLike {
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
		if taskLike && contains(ch.DoneStatuses, a.status) {
			checkDoneTask(a, g, reg, cfg, c)
		}

		// Chain status matching is exact and case-sensitive. A status that differs
		// from a configured chain status ONLY by case or surrounding whitespace
		// (e.g. "Done" vs "done") silently bypasses the status-gated rules above, so
		// flag that specific near-miss. Legitimate non-action statuses
		// ("in_progress", "blocked") match no vocabulary at all and are left alone.
		if a.status != "" && (reqLike || taskLike) && miscasedChainStatus(ch, reqLike, taskLike, a.status) {
			c.Warnf(a.path, a.doc.FrontStartLine(), "chain.unrecognizedStatus",
				"%q has status %q, which differs only by case/whitespace from a configured chain status; status matching is case-sensitive, so the chain status rules were not applied", a.idOrPath(), a.status)
		}
	}
}

// miscasedChainStatus reports whether status differs from a configured chain
// status (relevant to the artifact's capabilities) ONLY by letter case or
// surrounding whitespace — a likely typo that silently bypasses the
// case-sensitive status rules. An exact match, or a value matching nothing at
// all, returns false (the latter is a legitimate non-action status, not a typo).
func miscasedChainStatus(ch config.ChainConfig, reqLike, taskLike bool, status string) bool {
	var vocab []string
	if reqLike {
		vocab = append(vocab, ch.ActiveReqStatuses...)
		vocab = append(vocab, ch.ProposedStatuses...)
	}
	if taskLike {
		vocab = append(vocab, ch.DoneStatuses...)
	}
	for _, v := range vocab {
		if v == status {
			return false // exact match — recognized, rules ran
		}
	}
	norm := strings.ToLower(strings.TrimSpace(status))
	for _, v := range vocab {
		if strings.ToLower(strings.TrimSpace(v)) == norm {
			return true // case/whitespace-only difference — likely typo
		}
	}
	return false
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
	if !direct && !viaParent {
		// A broken parent link cannot establish a trace, so an unresolved parent
		// must not silently suppress the untraced error — give it its own finding
		// rather than relying on link.unresolved staying an error elsewhere.
		if parentUnresolved {
			c.Errf(a.path, line, "chain.doneTaskParentUnresolved",
				"task %q is done and traces only through a parent link that does not resolve to an existing document", a.idOrPath())
		} else {
			c.Errf(a.path, line, "chain.doneTaskUntraced",
				"task %q is done but neither implements a requirement directly nor has a parent that does", a.idOrPath())
		}
	}
}
