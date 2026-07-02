---
type: ArtifactType
defines: Story
extends: BacklogItem
description: A user story — a small, user-facing increment of value.
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
    doc: The role/persona — the "As a …" clause.
  i_want:
    doc: The capability — the "I want …" clause.
  so_that:
    doc: The benefit — the "so that …" clause.
  acceptance_criteria:
    type: list
    doc: Acceptance criteria, one per item — ideally GIVEN/WHEN/THEN in RFC 2119 language (SHALL/MUST/SHOULD/MAY). For a criterion that deserves a test link, author a Scenario instead.
relationships:
  parent:
    target: Epic
    max: 1
    doc: The epic this story belongs to.
  persona:
    target: Persona
    max: 1
    doc: The persona this story serves.
  implements:
    target: Requirement
    doc: The requirement(s) this story fulfils.
  verified_by:
    target: Test
    doc: Acceptance tests proving the story is done.
---

# Story

A **Story** (user story) is the primary unit of user-facing value. The `as_a` /
`i_want` / `so_that` fields capture the classic template, `persona` points at the
[Persona](persona.md) it serves, and `acceptance_criteria` (plus a body section)
define "done". Stories roll up to an [Epic](epic.md), break down into
[Task](task.md)s, `implements` [Requirement](requirement.md)s, and are
`verified_by` [Test](test.md)s.
