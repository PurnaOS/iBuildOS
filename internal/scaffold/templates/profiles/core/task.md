---
type: ArtifactType
defines: Task
extends: WorkItem
description: The smallest unit of executable work — the thing you actually do.
fields:
  id:
    required: true
    pattern: "TASK-<number>"
    doc: Stable identifier, e.g. TASK-014.
  status:
    required: true
    one_of: [todo, in_progress, blocked, done]
    doc: Current state. A Task is `done` only once its code exists and its test passes.
  code:
    type: list
    doc: Globs of the source files this task produces or changes, e.g. internal/foo/*.go.
relationships:
  implements:
    target: Requirement
    doc: The requirement(s) this task fulfils (directly, or inherited via parent).
  verified_by:
    target: Test
    doc: The test(s) proving this task works.
  parent:
    target: WorkItem
    max: 1
    doc: Optional parent (a Story, or a larger Task) for grouping and trace-via-parent.
---

# Task

A **Task** is the unit of work that produces code. It `implements` a
[Requirement](requirement.md) — directly, or by hanging under a `parent` that
does — and is `verified_by` a [Test](test.md). The gate enforces the honest
chain: a `done` Task must have `code` globs that match real files and a `passing`
test, and must trace to a requirement.
