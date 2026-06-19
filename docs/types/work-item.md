---
type: ArtifactType
defines: WorkItem
abstract: true
description: Abstract base for artifacts that someone owns and that move through a lifecycle.
fields:
  id:
    required: true
    doc: Stable unique identifier. Other artifacts link to this by id, never by title.
  title:
    required: true
    doc: Human-readable name.
  owner:
    required: true
    doc: Person or team accountable for the artifact.
  status:
    required: true
    doc: Current lifecycle state. Concrete types narrow the allowed values.
---

# WorkItem

An abstract base type. WorkItems are never created directly; concrete types such
as [Task](task.md), [Requirement](requirement.md), and [Test](test.md) declare
`extends: WorkItem` to inherit `id`, `title`, `owner`, and `status` without
repeating them.

`abstract: true` tells the validator that no document may declare
`type: WorkItem` directly — it exists only to be extended.
