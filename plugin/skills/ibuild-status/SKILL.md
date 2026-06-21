---
name: ibuild-status
description: >
  Show a traceability dashboard for the OKF-SDLC bundle, derived from `iBuild
  graph` — chain completeness, unimplemented or untested requirements, orphan
  tasks, code/test coverage, and work rolled up by Release/Epic. Use when the user
  says "status", "where are we", "traceability dashboard", "what's left", "show
  the graph", "coverage", or "health of the bundle". Read-only — it reports, it
  doesn't change anything. State lives in git, not a sidecar.
---

# iBuild Status

A live picture of the bundle, computed from the artifacts in git. No external
tracker, no hidden state — `iBuild graph` is the whole knowledge graph.

## Procedure

1. **Locate the bundle** (read `.ibuildos.yaml`).
2. **Pull the graph.** Run `iBuild graph . --format json` (add `--body none` for a
   compact pass). The `types` block tells you which relationships matter
   (`implements`, `verified_by`, `parent`); the `nodes`/`edges` are the data.
3. **Run the gate for the headline.** `iBuild validate . --format json` gives the
   authoritative error/warning counts. Lead with those.
4. **Summarize**, deriving from the graph (not by guessing):
   - **Requirements**: how many, how many implemented (have an incoming
     `implements` edge), how many verified (incoming `verifies`/`verified_by`).
     List the unimplemented/untested ones by id.
   - **Work**: tasks by status; `done` tasks missing code or a passing test;
     orphan tasks (no `parent`, no `implements`).
   - **Coverage**: roll work up by `parent` to Epic/Story, and by `planned_for`
     to Release, if those links exist.
   - **Dangling links**: edges with `resolved: false`.
5. **Present** a short, scannable dashboard. Point the user at `/ibuild-audit` to
   fix structural gaps or `/ibuild-contradict` for semantic ones.

## Fast lookups

`iBuild graph --node <ref> --depth 1` answers "what touches this artifact" in one
call — use it when the user asks about a specific requirement or task.

## Boundaries

- Read-only. Never edit or commit.
- Numbers come from `iBuild graph`/`iBuild validate`, not from prose inference —
  if you can't derive it from the graph, say so.
