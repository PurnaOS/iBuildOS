---
type: DesignCharter
title: "iBuildOS — Design Charter & UX Decree (Build-Ready Kit #5)"
description: >-
  The design authority for autonomous building: screen inventory, navigation map, decreed
  design tokens, the PS-006 vocabulary glossary, copy principles, and the decree that
  agent-invented UX within this charter is accepted for v1 subject to post-hoc review.
status: draft
version: 1.0.0
date: 2026-08-14
owner: srini
tags: [ibuildos, design, charter, build-ready-kit]
---

# Design Charter

## 0. The Decree (signed by adoption of this kit)

> Within the bounds of this charter, **agent-invented UX is accepted for v1**: layout,
> composition, empty states, micro-interactions, and copy may be designed by the builder
> without asking, recorded implicitly by the implementation and reviewed post-hoc like any
> other landed work. The charter's tokens, navigation map, screen inventory, and glossary are
> the bounds; deviation from *those* requires a `builder-decision` record (Execution Plan
> charter rule 1).

## 1. Design tokens (decreed)

- **Base system:** shadcn/ui on Radix primitives, Tailwind CSS; components owned in-repo.
- **Density:** Linear-class compact — 13px base UI type, 4px spacing grid, 1px hairline
  borders over shadows, generous whitespace only in Product-mode reading surfaces (15px base
  there).
- **Type:** system font stack (SF/Segoe/Inter fallback); mono (JetBrains Mono fallback
  ui-monospace) for IDs, paths, commands, rules.
- **Color:** neutral gray ramp + **one accent** (default `#4f46e5`; single-line swap);
  semantic colors derived from artifact state buckets, computed from the profile — done/green,
  active/amber, blocked/red, ready/blue, draft/gray. **State is never color-alone** (icon +
  label always).
- **Themes:** light + dark from day one, `prefers-color-scheme` + manual toggle, AA contrast
  both.
- **Motion:** 120–180 ms ease-out for state changes; `prefers-reduced-motion` honored;
  streaming text renders without layout shift.
- **A11y:** visible focus rings, full keyboard paths (palette-first), landmarks/roles per
  route, `role=log` for streams (NFR-011).
- **App icon:** placeholder geometric mark for development; final icon arrives with the
  provisioning pack (PROVISIONING §6).

## 2. Navigation map

```
App
├── Home (project grid + global attention count)
└── Project window
    ├── Mode switch: PRODUCT ⇄ ENGINEERING (⌘E, per-user, per-project)
    ├── Global: ⌘K palette · attention queue (⌘J) · chat panel (⌘L, context-aware)
    ├── PRODUCT mode sidebar
    │   ├── Overview (progress, activity, trunk preview launcher)
    │   ├── Requirements (list/detail/interview) → Breakdown (plan tree)
    │   ├── Plan (backlog · board · dependencies · releases[· sprints])
    │   ├── Build (streams grid → stream watch → acceptance)
    │   ├── Changes (list · impact · undo)
    │   ├── Quality (coverage · suites · manual runs)
    │   ├── Releases (readiness · deploy · notes)
    │   └── Insights (progress · quality · team · digests)
    └── ENGINEERING mode sidebar
        ├── Overview (gates, trunk state, merge queue)
        ├── Artifacts (all types, raw OKF view) · Trace (chain/matrix/graph)
        ├── Streams (worktrees, transcripts, diffs) · Merge queue (+ conflicts, trunk-broken)
        ├── Reviews (diffs, comments) · Runs (agent ops, transcripts)
        ├── Problems (findings, baseline, drift)
        ├── Profile (types, states, gates editor) · Contract (components, commands, trust)
        └── System (agents, roles, skills, commands, MCP, environments, pins)
Cross-mode deep links everywhere (PS-007); settings tree per PS-012; project wizard,
adoption flow, deploy-connect, and secret-request are modal flows reachable from context.
```

## 3. Screen inventory (the 36 surfaces; ✂ = also exists as palette action)

**Shell (6):** Home · Project wizard (template→agent→scaffold) · Adoption flow (4 steps) ·
Settings tree · Attention queue ✂ · Onboarding/first-run.
**Product (14):** Overview · Requirements list+detail · Interview (chat + accumulating side
panel) · Breakdown plan tree · Backlog · Board · Dependency view · Releases+readiness ·
Stream grid · Stream watch (product lens) · Acceptance screen · Changes+impact · Undo flow ·
Quality (coverage/suites/manual runner) · Insights set.
**Engineering (12):** Artifacts browser+raw view · Trace (matrix/graph) · Stream watch
(engineering lens: transcript/tools/diffs) · Merge queue · Conflict resolution review ·
Trunk-broken remediation · Reviews (diff+comments) · Runs/agent-ops · Problems (findings/
baseline/drift) · Profile editor · Contract/trust editor · System (agents/skills/commands/
env/pins).
**Flows/modals (4):** Preview pane(s) incl. PV-008 HTTP console + CLI runner · Deploy +
connect (DR-008) · Secret request (AC-013) · Digest composer.

## 4. Vocabulary glossary (PS-006's gate instrument — seed set)

Product mode **never** shows the left column; always the right:

| Banned in Product mode | Use instead |
|---|---|
| branch, worktree, checkout | workspace / (invisible) |
| commit, push, pull, fetch | save, share, sync |
| merge, merge conflict | finish & combine, "changes need reconciling" |
| diff, patch | what changed |
| repo, repository | project |
| PR / pull request | review request |
| CI, pipeline | checks |
| lint, linter | checks |
| frontmatter, YAML, markdown, OKF | details / (invisible) |
| SHA, HEAD, trunk/main | version, the live product |
| stream (internal term OK) | build («Story» is being built) |
| gate red/green (engineering OK) | "ready" / "needs attention" |
| worktree GC, rebase | (invisible; "updated with latest") |
| agent session, transcript | assistant, activity |
| provisional ID | (invisible) |

Additions append; the PS-006 CI lint runs Product-mode strings against this table.
Engineering mode uses the precise terms freely.

## 5. Copy principles

Sentence case everywhere · verbs on buttons ("Accept story", never "OK") · errors say what
happened + what to do next, in mode-appropriate vocabulary · agent activity summarized in
product terms ("Writing tests for offline sync — 2 of 5 tasks done") · numbers over adjectives
("3 checks failing", not "several issues") · empty states teach the next action · no
exclamation marks, no blame ("The build needs attention", never "You broke…").

## 6. What this charter does NOT cover

Final brand identity, marketing site, and the shipped app icon — provisioning-adjacent,
human-owned. The builder ships the placeholder mark and neutral naming ("iBuildOS")
throughout.
