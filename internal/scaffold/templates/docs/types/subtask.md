---
type: ArtifactType
defines: Subtask
extends: WorkItem
description: A fine-grained breakdown of a single task.
fields:
  id:
    required: true
    pattern: "SUB-<number>"
    doc: Stable identifier, e.g. SUB-104.
  status:
    required: true
    one_of: [todo, in_progress, done]
    doc: Current state.
relationships:
  parent:
    target: Task
    min: 1
    max: 1
    doc: The task this subtask breaks down. Required — subtasks never stand alone.
---

# Subtask

A **Subtask** is the finest level of breakdown, always belonging to exactly one
[Task](task.md) (`parent` is required, `min: 1`, `max: 1`). It extends
[WorkItem](work-item.md) rather than [BacklogItem](backlog-item.md): subtasks
inherit planning context from their parent task instead of being planned on their
own.
