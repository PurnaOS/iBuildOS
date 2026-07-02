---
type: ArtifactType
defines: Story
extends: WorkItem
description: A user story — a small, user-facing increment of value that groups tasks.
fields:
  id:
    required: true
    pattern: "STORY-<number>"
    doc: Stable identifier, e.g. STORY-022.
  status:
    required: true
    one_of: [todo, in_progress, in_review, done]
    doc: Current state.
  as_a:
    doc: The role — the "As a …" clause.
  i_want:
    doc: The capability — the "I want …" clause.
  so_that:
    doc: The benefit — the "so that …" clause.
  acceptance_criteria:
    type: list
    doc: Acceptance criteria, one per item — ideally GIVEN/WHEN/THEN in RFC 2119 language (SHALL/MUST/SHOULD/MAY).
relationships:
  implements:
    target: Requirement
    doc: The requirement(s) this story fulfils.
  verified_by:
    target: Test
    doc: Acceptance tests proving the story is done.
  parent:
    target: WorkItem
    max: 1
    doc: Optional parent for grouping (e.g. a larger Story).
---

# Story

A **Story** is an optional, user-facing grouping above [Task](task.md)s. It
`implements` a [Requirement](requirement.md) and is `verified_by` a
[Test](test.md). Tasks hang under it via their `parent` link, so a Task traces to
a requirement through its Story even when it doesn't `implements` one directly.
Skip stories entirely if your tasks map straight to requirements.
