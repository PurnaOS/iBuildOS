---
type: Change
id: CHANGE-agent-control-plane
title: "Agent control plane: iBuild run + agent-team kit, all state in the repo"
owner: srini
status: done
scope: added
links:
  affects:
    - /requirements/ag/ag-009.md
    - /requirements/ag/ag-010.md
    - /requirements/ag/ag-011.md
    - /requirements/ag/ag-012.md
  delivers:
    - /work/task-0002.md
    - /work/task-0003.md
    - /work/task-0004.md
    - /work/task-0005.md
    - /work/task-0006.md
---

# CHANGE — Agent control plane

## Why

iBuild tracks requirements, work, and tests but does not complete the work.
Paperclip-style agent control planes (org of agents, goals → tasks, heartbeats,
atomic checkout, audit ledger) prove the model but keep their state in a server
database. iBuild already holds the entire SDLC in the repo — the missing piece
is an executor that drives a coding agent through the existing
Requirement → Task → Code → Test chain, with the repo itself as the control
plane's database.

## What changes

- **ADDED AG-010** — agent registry as artifacts: a new `Agent` type
  (extends `Actor`, body = role charter) so agents are assignable, versioned,
  reviewable identities in `docs/agents/`.
- **ADDED AG-011** — agent run audit log: a new `AgentRun` type (modeled on
  `TestResult`, `ARUN-` ids) recording every executor run in
  `docs/work/runs/`; progress surfaces are derived from artifacts + git, never
  hand-maintained.
- **ADDED AG-012** — `iBuild run`: a deterministic, config-keyed, harness-agnostic
  loop that selects ready tasks, spawns the configured coding harness, gates on
  `iBuild validate` + the project test command, records an `AgentRun`, and
  commits locally per task (never pushes).
- **ADDED AG-009** — the agent-team kit requirement is catalogued and delivered
  here: `plugin/commands/run-backlog.md` (installed by `iBuild init`); charters
  live as `Agent` artifacts rather than inline prose; the prototype's
  PROGRESS.md / TIME_TRACKING.md are replaced by derived surfaces.

## Design

Two doctrine calls, made explicitly here:

1. **Progress is derived, never hand-maintained.** The prototype's PROGRESS.md
   and TIME_TRACKING.md duplicate state the graph already holds. Who-is-working
   = `in_progress` tasks + `assignee` + `running` AgentRuns; the event log =
   `git log docs/work/runs/`; heartbeats = the `heartbeat` field's commit
   history.
2. **Operator mode commits; the knowledge layer stays suggest-only.** Skills and
   Studio agent-assist never commit (AG-003). `iBuild run` and `/run-backlog`
   are execution modes a human explicitly invokes: they commit locally per task
   as the audit ledger, and pushing remains structurally impossible — human
   review moves to before-push.
