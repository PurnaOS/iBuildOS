---
type: ArtifactType
defines: Sprint
extends: WorkItem
description: A time-boxed iteration. Optional under flow-based planning.
fields:
  id:
    required: true
    pattern: "SPRINT-<number>"
    doc: Stable identifier, e.g. SPRINT-48.
  status:
    required: true
    one_of: [planned, active, closed]
    doc: Current state.
  start_date:
    type: date
    doc: First day of the sprint (ISO 8601).
  end_date:
    type: date
    doc: Last day of the sprint (ISO 8601).
  goal:
    doc: The sprint goal.
---

# Sprint

A **Sprint** (iteration) is a time-box that [BacklogItem](backlog-item.md)s are
`scheduled_in`. It is optional: Kanban/flow teams can ignore this type entirely
and plan with [Release](release.md)s and [Milestone](milestone.md)s instead — the
generic-agile profile keeps it available without forcing it.
