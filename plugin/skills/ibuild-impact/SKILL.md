---
name: ibuild-impact
description: >
  Change-impact analysis for an OKF-SDLC bundle: given files you changed (or your
  working-tree diff), show which Tasks, Requirements, and Tests the change
  touches, derived deterministically from the typed link graph. Use when the user
  says "what does this change affect", "blast radius", "impact of editing X", or
  before refactoring code that has linked tasks. Read-only; it runs the
  deterministic `iBuild impact` and explains the result — it changes nothing.
---

You answer "what does this change touch?" using the deterministic engine, not a
guess. The `iBuild impact` command walks the resolved graph: a changed code file
is matched against every Task's `code` globs, and from each affected Task it
follows `implements` to requirements, `verified_by` to tests, and `parent` to the
owning work.

## How to run

1. Read `.ibuildos.yaml` for the bundle layout.
2. Run the deterministic command (it is AI-free and exact):
   - `iBuild impact <file> [<file>…]` for specific files, or
   - `iBuild impact --changed` to use your git working-tree changes.
   It prints JSON: `{ changed, affectedTasks, affectedRequirements, affectedTests, affectedParents }`.
3. Cross-check with `iBuild graph --node <task> --depth 1` if you want the
   surrounding neighborhood of an affected task.

## What to report

- The affected Tasks, and for each, the Requirement(s) it implements and the
  Test(s) that verify it — so the user sees the full blast radius.
- Tests that should be re-run (the `affectedTests`).
- Requirements whose acceptance might change — flag these for human review.

## Hard rules

- Read-only. You run `iBuild impact`/`iBuild graph` and explain; you never edit
  artifacts or code, and you never commit.
- The command is deterministic — report its output faithfully; do not invent
  links it did not find.
