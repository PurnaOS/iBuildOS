---
type: Guide
title: "IBuildOS — The New User's Journey: Develop, Deliver, and Fix Bugs"
description: >-
  A narrative walkthrough of how a developer builds new software from the ground up with IBuildOS,
  working in parallel with coding agents, then delivers it and fixes bugs — all inside one git repo.
status: draft
version: 0.1.0
date: 2026-06-30
owner: srini
tags: [ibuildos, guide, journey, greenfield, parallel, agentic]
---

# The New User's Journey

This note follows a developer — call her Maya — building a brand-new product with IBuildOS. It shows
the everyday loop: how she **develops** software from an empty folder, **delivers** it, and **fixes
bugs**, while several coding agents work in parallel. Requirement IDs in brackets (e.g., `IN-002`) point
to the clauses in [REQUIREMENTS.md](REQUIREMENTS.md) that guarantee each step, so the story is itself
traceable to the spec.

The one idea to hold onto: **everything Maya produces — intent, plans, tests, decisions, and code — is a
version-controlled artifact in one git repo.** Agents and humans read and write the same repo; a fast,
deterministic gate keeps it honest; nothing important lives in a tool she'd have to leave the repo to find.

---

## The loop at a glance

Idea → repository → requirements → plan → **parallel build** → validate & test → review → deliver →
maintain, with bug-fixing as the same loop run in miniature. Each arrow is a reviewed git change, not a
hand-off into another system.

---

## 1. Stand up the repository (greenfield)

Maya starts with an empty folder and runs the init CLI. IBuildOS detects a greenfield project and
interviews her about the kind of system she's building `[IN-002]`, lets her pick and tune the SDLC
profile — the type taxonomy and rules her project will follow `[IN-007]` — and scaffolds the repo.

By the time init finishes she has a working operating system for her project, not a blank page:
conformant **artifact templates** for every type so authoring is fill-in-the-blank `[IN-008]`; a
**default workflow** wired up — the spec → plan → tasks → implement → validate → review → release loop,
with the validation gate running in CI and as a pre-commit hook `[IN-009]`; and agent guidance files
(`CLAUDE.md`, `AGENTS.md`) plus repo-local skills and commands so any coding agent she points at the repo
already knows the house rules `[HS-001, HS-002]`.

## 2. Capture intent: vision to requirements

Maya writes a short vision and a PRD, then refines them into business, functional, and non-functional
requirements `[RM-001]`. Each requirement gets a stable ID that survives edits and moves `[RM-002]`, an
owner `[RM-004]`, and testable acceptance criteria `[RM-006]`.

She doesn't have to type it all by hand. From the UI she can fill guided, template-backed forms that
validate against the profile as she types `[UI-010]`, or she can **ask a coding agent to draft and edit
the artifacts for her** — describe the feature and let the agent write the requirements and specs, which
come back as a reviewable change, never a silent write `[UI-014, AG-002, AG-003]`. Specifications live as
the project's source of truth, and every change to them flows as an OpenSpec-style proposal — intent,
spec delta, design, tasks — that she reviews before it lands `[SA-001, SA-002]`.

## 3. Plan the work

The requirements get broken into a work breakdown: initiatives, epics, stories, tasks, and subtasks
`[WP-001]`. Maya can do this on a board in the UI — arranging the hierarchy, assigning owners, and
sequencing work into releases `[UI-012]` — or have an agent propose the breakdown from the requirements
`[WP-006]`. Crucially, each piece of work links back to the requirement it `implements`, so the chain
from idea to task is connected from the start `[TR-001, TR-002]`.

## 4. Build in parallel — the heart of it

This is where IBuildOS earns its keep. Instead of one long branch, Maya spins up **several coding agents
at once, each in its own isolated workspace** (a git worktree on its own branch), so they never trip over
each other `[VC-004]`. One agent implements the login story; another writes the data layer; a third adds
tests for an API the first two depend on. She watches all of them — what each is working on and whether it
currently passes the gate — from one conductor-like view `[VC-006, UI-006]`.

Each agent works in **small, stacked changes** rather than a single giant pull request: focused diffs that
build on one another and can be reviewed independently `[VC-002]`. A change proposal maps cleanly onto a
stack, one diff per task, so traceability holds across the whole stack `[VC-003]`. Maya kicks off and
steers this work conversationally — "add rate-limiting to the login endpoint" — and the agent edits the
relevant artifacts and code, returning a reviewable diff `[UI-014, AG-002]`.

Before anything merges, every workspace must pass the deterministic gate, and validation runs **per diff
in a stack and on the integrated result**, so a stack can never merge with a broken traceability chain
`[VC-005, VC-007]`. When two agents do touch the same ground, IBuildOS surfaces the conflict and each
side's validation state, and **Maya finalizes the resolution locally** — the system never silently
auto-merges `[VC-009]`.

## 5. Validate and test continuously

The gate is fast, deterministic, and runs with no AI and no network `[VL-001]`. It checks that every
artifact conforms to its type, that typed links resolve to the right kind of target, and that the chain
has no orphans — a requirement with no work, a task with no test, code with no task `[VL-005, TR-005]`.
It folds in documentation linting and orchestrates her existing code linters in one unified gate
`[VL-011, CQ-001, CQ-002]`. The standing rule is simple: **every commit should be consistent** — the
repo validates cleanly at each commit, not just at release `[VL-012]`.

Testing is first-class. Tests — manual and automated — are artifacts that `verify` requirements
`[TT-001, TT-003]`. Maya can **run the tests straight from IBuildOS**, which orchestrates her existing
test runners rather than locking her into one `[TT-009]`, and the results are written back as versioned
OKF artifacts instead of disappearing into CI logs `[TT-008]`. At any moment she can see which
requirements still lack a verifying test `[TT-005]`.

## 6. Review and merge

Every change — to code and to knowledge alike — lands through a reviewable git change `[VC-001]`. Maya
reviews stacked diffs and change proposals in the UI, commenting and approving, with each change's
validation result and traceability impact shown alongside it `[UI-011]`. Agent-proposed changes are
treated exactly like human ones: reviewed and merged by a person, never auto-committed to the source of
truth `[AG-003]`.

## 7. Deliver

When a release's scope is traced and tested, Maya cuts it. Release readiness is computed from the repo —
scope, completion percentage, and open risks — so she isn't guessing `[PM-003]`, and traceability can be
scoped to exactly this release to confirm nothing in it is unverified `[TR-007]`. Release notes are
generated from the work and spec changes that actually shipped, ready for her to review and send
`[SK-002]`. The release itself is an artifact in the repo, so what shipped — and why — stays part of the
permanent record. (Actual build-and-deploy runs through her existing CI/CD; IBuildOS tracks and gates the
release rather than replacing her pipeline — see the review note below.)

## 8. Fix a bug

A user reports a problem. Maya files a **bug** as a first-class artifact with reproduction, severity, and
owner `[BG-001]`, moving through a defined lifecycle: new → triaged → in-progress → fixed → verified →
closed `[BG-002]`. The bug links to the requirement or component it affects and to the task that will fix
it `[BG-003]`. From here it's the same loop in miniature: an agent (or Maya) works the fix in its own
workspace, writes a **regression test that guards against the bug returning** `[BG-004]`, runs the tests
from the tool `[TT-009]`, passes the gate, and merges through review. Because the fix is traced to a test
and a requirement, the system can prove the bug is actually closed — not just marked closed.

## 9. Keep it honest over time

As the codebase grows, IBuildOS keeps signaling drift so the knowledge doesn't rot. Static analysis flags
gaps between what the plan says and what the code does — tasks marked done with no matching code, code
with no linked task `[GP-002, GP-004]`. Progress and health metrics — coverage, orphans, validation pass
rate — are derived from the repo and git history, never hand-maintained `[PM-004]`. Staleness is caught by
the team's existing staleness checker, which IBuildOS runs and surfaces `[CQ-005, AG-004]`. And change
summaries and status updates can be generated from repo activity for stakeholders `[SK-002]`.

---

## Why this works for a small, parallel, agentic team

Maya never context-switches into a separate tool to know the state of her project, because the repo *is*
the project. Many agents move at once without chaos because each is **isolated, stacked, and gated** before
it can touch the shared trunk. And she trusts the result because a deterministic check — not an AI's
opinion — is the thing that says "this is consistent," with the full chain from idea to test traceable at
every commit.

## Quick reference — phase to requirements

| Phase | Key requirements |
|---|---|
| Stand up the repo (greenfield) | `IN-002`, `IN-007`, `IN-008`, `IN-009`, `HS-001`, `HS-002` |
| Capture intent → requirements | `RM-001`, `RM-002`, `RM-004`, `RM-006`, `SA-001`, `SA-002`, `UI-010`, `UI-014`, `AG-002` |
| Plan the work | `WP-001`, `WP-006`, `UI-012`, `TR-001`, `TR-002` |
| Build in parallel | `VC-002`, `VC-003`, `VC-004`, `VC-005`, `VC-006`, `VC-007`, `VC-009`, `UI-006`, `UI-014` |
| Validate & test | `VL-001`, `VL-005`, `VL-011`, `VL-012`, `CQ-001`, `CQ-002`, `TT-003`, `TT-005`, `TT-008`, `TT-009` |
| Review & merge | `VC-001`, `UI-011`, `AG-003` |
| Deliver | `PM-003`, `TR-007`, `SK-002` |
| Fix a bug | `BG-001`, `BG-002`, `BG-003`, `BG-004`, `TT-009` |
| Keep it honest | `GP-002`, `GP-004`, `PM-004`, `CQ-005`, `AG-004` |

---

## Review note — does the spec support this journey end to end?

Walking the greenfield-and-parallel path above against the spec, the journey is **well covered**: init,
requirements, planning, parallel agentic build, validation, testing, review, bug-fixing, and maintenance
each map to concrete requirements (see the table). Three observations worth a decision:

1. **Delivery/deployment is tracked, not executed.** The spec models release *knowledge* — readiness
   `[PM-003]`, notes `[SK-002]`, scoped traceability `[TR-007]`, and the Release artifact — but, unlike
   tests (`TT-009` runs them), there is no explicit clause for IBuildOS *triggering* a release or deploy.
   That's defensible (delegate to existing CI/CD, consistent with no lock-in), but worth stating
   deliberately — or adding a "release execution orchestrates existing CD" requirement.

2. **Task dependencies aren't modeled, which the parallel story leans on.** Safe parallelism assumes the
   work is sliced into independent pieces, yet the data model only has `parent` (hierarchy), not a
   `depends_on` / `blocks` relationship between work items. Adding one — plus a rule that parallel stacks
   shouldn't share an unresolved dependency — would make the "many agents at once" flow safer and checkable.

3. **(Minor) Environments, test data, and secrets** for running tests and delivering aren't modeled.
   Likely intentional (delegated), but a one-line boundary in §12 would make that explicit.

None of these block the journey; items 1 and 2 are the highest-value follow-ups.
