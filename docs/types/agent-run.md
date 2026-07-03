---
type: ArtifactType
defines: AgentRun
description: One recorded execution of an agent against a work item — the audit-log unit, machine-written like TestResult.
fields:
  id:
    required: true
    pattern: "ARUN-<slug>"
    doc: Stable identifier, e.g. ARUN-2026-07-03-task-0042.
  status:
    required: true
    one_of: [running, succeeded, failed, aborted]
    doc: Outcome. `running` is a live claim; `aborted` covers timeouts and stall-kills — a restart opens a new run.
  started:
    required: true
    pattern: "regex:\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z"
    doc: UTC start (`date -u +%Y-%m-%dT%H:%M:%SZ`) — recorded, never guessed.
  ended:
    pattern: "regex:\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z"
    doc: UTC end, once the run reaches a terminal status.
  heartbeat:
    pattern: "regex:\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z"
    doc: Last liveness ping, updated in place — this field's commit history is the heartbeat log.
  harness:
    doc: What actually ran (echo of the Agent's harness or the executor default).
  attempts:
    type: number
    doc: How many attempts the executor made before this outcome.
  base_commit:
    doc: HEAD before the run started — the audit anchor for the diff it produced.
relationships:
  run_by:
    target: Agent
    max: 1
    doc: The agent that performed the run.
  executes:
    target: WorkItem
    max: 1
    doc: The work item the run worked on — satisfied polymorphically by any WorkItem subtype.
---

# AgentRun

An **AgentRun** records one autonomous execution of a work item, the way a
[TestResult](test-result.md) records one test run: a machine-written,
version-controlled result record — not a work item — so it draws no chain
findings (AG-011). The body carries the outcome summary and a short excerpt of
the harness log (a pointer, not a transcript).

Runs live under the work tree (e.g. `work/runs/`). Progress surfaces are
derived from them: who-is-working = `running` runs, the event log =
`git log` over the runs directory, heartbeats = the `heartbeat` field's commit
history. Ids use `ARUN-` because `RUN-` belongs to [Runbook](runbook.md).
