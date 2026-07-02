---
type: Runbook
id: RUN-vc-workflow
title: Version-control workflow — stacked diffs, parallel agents, stack-aware validation
owner: srini
status: active
---

# Version-control workflow

How changes (to knowledge and code alike) flow into the source of truth. The
workflow is **tool-agnostic**: it works over native git and composes with
Graphite (`gt`), git worktrees, or Conductor — none is mandatory (VC-008).

## Branch / PR is the single review gate (VC-001, VC-010)

Every change — a requirement edit, an ADR, code — flows through a reviewable git
branch/PR. Concurrent edits by different people to the same artifact reconcile
through the normal review-and-merge flow, not a lock.

## Stacked diffs (VC-002, VC-003)

Prefer small, dependent, independently reviewable diffs over one monolithic PR.
A change proposal (a `Change` artifact) maps cleanly to a stack — each delivered
`Task` is one diff in the stack — so traceability is preserved across the stack.
Use `gt` or native `git` branches; iBuildOS does not require either.

## Parallel agent workspaces (VC-004, VC-006, VC-009)

Run multiple coding agents in parallel, each in an isolated workspace (a git
worktree on its own branch), Conductor-style. Each workspace is isolated; its
output must pass the deterministic gate before review. When parallel workspaces
produce overlapping changes, a developer finalizes the resolution **locally**
before merge — iBuildOS surfaces the conflict and each workspace's validation
state, but never auto-resolves.

## Stack-aware validation (VC-005, VC-007)

The deterministic gate runs per diff and on the integrated result, so a stack
never merges with a broken chain:

- Per working-tree change (pre-commit):  `iBuild validate . --changed`
- Per stack / PR (integrated set vs base):  `iBuild validate . --base origin/main`
- Whole bundle (final):  `iBuild validate .`

Adopting on a brownfield repo? Add `--baseline` to gate only new violations, or
`--report-only` to annotate without blocking while the baseline shrinks.
