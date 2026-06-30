---
type: ArtifactType
defines: Epic
extends: BacklogItem
description: A large body of work broken down into stories.
fields:
  id:
    required: true
    pattern: "EPIC-<number>"
    doc: Stable identifier, e.g. EPIC-031.
  status:
    required: true
    one_of: [proposed, in_progress, done, cancelled]
    doc: Current state.
relationships:
  parent:
    target: Initiative
    max: 1
    doc: The initiative this epic belongs to.
  implements:
    target: Requirement
    doc: Requirement(s) this epic fulfils.
  realized_by:
    target: Story
    doc: The stories that deliver this epic.
---

# Epic

An **Epic** is a large chunk of work under an [Initiative](initiative.md),
delivered through a set of [Story](story.md)s and tied to one or more
[Requirement](requirement.md)s via `implements`. Epics are the level most teams
plan releases around.
