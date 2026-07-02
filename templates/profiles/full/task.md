---
type: ArtifactType
defines: Task
extends: BacklogItem
description: The smallest unit of executable work.
fields:
  id:
    required: true
    pattern: "TASK-<number>"
    doc: Stable unique identifier, e.g. TASK-014.
  status:
    required: true
    one_of: [todo, in_progress, blocked, done]
    doc: Current lifecycle state.
  code:
    type: list
    doc: Repo-relative path globs to the source this task produces. At least one must match a file on disk; a `done` task must declare code.
relationships:
  parent:
    target: Story
    max: 1
    doc: The user story this task helps deliver.
  implements:
    target: Requirement
    doc: Requirement(s) this task fulfils directly (optional when the reason comes from its parent Story).
  verified_by:
    target: Test
    doc: Tests that prove this task is complete.
---

# Task

A **Task** is the smallest unit of executable work. It extends
[BacklogItem](backlog-item.md) (so it can be prioritised, estimated, and planned)
and usually rolls up to a [Story](story.md) via `parent`.

A task must trace to a [Requirement](requirement.md) — either directly through
`implements`, or transitively through its parent Story — and should be
`verified_by` at least one [Test](test.md) before it is marked `done`. The Phase 1
linter enforces this `Requirement → Task → Test` chain.

## Example

A conformant task document (e.g. `work/task-014.md`):

```markdown
---
type: Task
id: TASK-014
title: Add freshness SLA alert to orders pipeline
status: in_progress
owner: srini
priority: should
links:
  parent:      [/work/story-022.md]
  implements:  [/requirements/fr-0007.md]
  verified_by: [/tests/test-orders-freshness.md]
---

Wire a freshness check into the orders pipeline that raises an alert when the
data lags its SLA by more than 30 minutes.
```
