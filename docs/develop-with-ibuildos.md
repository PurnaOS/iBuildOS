---
type: Reference
title: Develop a New Project with iBuildOS
description: The end-to-end lifecycle — from idea to shipped, traceable work — using OKF-SDLC artifacts and the iBuild gate.
tags: [guide, lifecycle, okf, sdlc]
---

# Develop a New Project with iBuildOS

iBuildOS turns your repo into the single source of truth for the whole SDLC. You
write requirements and plan work as **OKF artifacts** (markdown + YAML frontmatter
with typed links); the deterministic **`iBuild`** linter checks the
Requirement→Task→Code→Test chain; and a set of Claude Code skills do the authoring
with you. AI **suggests and edits — it never auto-commits and never runs inside the
linter.**

This is the path, in the order you actually type it.

## 0. Set up (once)

```bash
iBuild init .            # scaffolds .ibuildos.yaml, docs/types/, the bundle dirs,
                         # AND a vendored .claude/ (the skills + agents + the
                         # validate-on-edit hook)
iBuild validate .        # exits 0 — an empty bundle is a valid bundle
```

`iBuild init` vendors the skills into `.claude/`, so a clone of this repo is
self-contained — every `/ibuild-*` command works with **no install**. (You can
also install them machine-wide as a plugin: `/plugin marketplace add
PurnaOS/iBuildOS` then `/plugin install ibuildos`.) Commit `.claude/` so your
team gets the same workflow.

## 1. Discover — idea → Vision / PRD / BusinessRequirement

```
/ibuild-discover
```
Turns a raw idea into the top of the chain: a **Vision**, a **PRD**, and one or more
**BusinessRequirement** artifacts, linked. This is your "why".

## 2. Plan — requirements and a work breakdown

```
/ibuild-plan
```
Refines business needs into **FunctionalRequirement** / **NonFunctionalRequirement**
artifacts, then decomposes the work: **Initiative → Epic → Story → Task → Subtask**,
with `parent` links climbing the hierarchy and `implements` links tracing work back
to the requirement it satisfies. Plan cadence with **Release** / **Sprint** when you
want it (`planned_for`, `scheduled_in`).

## 3. Build — author artifacts

```
/ibuild-author
```
Writes one artifact at a time, correctly: it reads the type definition in
`docs/types/` so it always supplies the required fields, a valid id, and the right
typed links. Use it whenever you need a single, conformant artifact.

## 4. Implement — write the code and close the chain

```
/ibuild-implement        # e.g. "implement TASK-0007" or "build this story"
```
iBuildOS plans and *proves* traceability; it does not generate your app code —
that's normal coding. This skill couples the two: it reads the Task (and the
requirement it implements), writes the real code and tests, **runs the test
command**, then wires the Task's `code:` globs and `verified_by` Test and flips it
to `status: done`. The honesty rule: `done` only after the suite actually goes
green — the gate refuses a `done` Task whose `code` matches nothing or whose Test
isn't `passing`.

## 5. Fix — the bug workflow

```
/ibuild-bug              # "file a bug", "fix this bug", or a BUG-id
```
A defect lives in the same graph as the feature it broke. This workflow captures a
**Bug** that `affects` the violated Requirement, reproduces it with a regression
test that **fails first**, finds the root cause (no fix without a reproduction),
fixes it, then proves the fix — the regression Test goes green, gets wired as
`verified_by`, and the Bug moves to `status: resolved`. Bug has no `code` field;
the proof *is* the regression test.

## 6. Review — gaps and contradictions

```
/ibuild-audit        # structural: runs iBuild validate, finds chain gaps, proposes fixes
/ibuild-contradict   # semantic: AI finds conflicts across linked artifacts
```
The auditor is deterministic-first — the linter is the authority; it adds the human
"why" and concrete edit proposals. The contradiction-checker reads the linked bodies
and flags conflicts the linter can't see (a Task that contradicts its requirement,
two NFRs that fight). Both **propose only** — you approve and apply.

## 7. Monitor — the traceability dashboard

```
/ibuild-status
```
Renders chain health from `iBuild graph`: which requirements are unimplemented or
untested, which Tasks are orphaned, coverage rolled up by Release/Epic. No sidecar
state — it's all derived from the artifacts in git.

## 8. Ship

```
/ibuild-ship
```
The gate: `iBuild validate .` must be clean and the chain complete before the work
becomes a PR.

## Fast knowledge — the graph is your "code graph"

`iBuild graph` is to your artifacts what a source-code graph (ctags/LSIF) is to
code: a precomputed, typed map you query in one call instead of grepping markdown.

```bash
iBuild graph .                                   # whole graph as JSON
iBuild graph --node /requirements/fr-0001.md     # one node + its neighbors
iBuild graph --node /work/task-0001.md --depth 2 --rel implements,verified_by
```

## The rules that keep the graph honest

- Every artifact conforms to its type definition in `docs/types/` — edit those to
  change your process; the linter follows with zero code change.
- Links are typed: a relationship names a `target` type and a cardinality.
- A **Task** is `status: done` only once its `code` globs match real files, its
  `verified_by` Test is `passing`, and it traces to a requirement.
- `iBuild validate .` exits 0 is the definition of "done enough to ship."
