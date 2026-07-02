---
type: ArtifactType
defines: Actor
abstract: true
description: Abstract base for an assignable identity — a User or a Team.
fields:
  id:
    required: true
    doc: Stable unique identifier. Other artifacts link to this by id.
  name:
    required: true
    doc: Display name.
---

# Actor

An abstract base for the things work can be **assigned to**: a [User](user.md) or
a [Team](team.md). A WorkItem's `assignee` relationship targets `Actor`, so it is
satisfied polymorphically by either. This is lightweight identity for assignment
and notification only — not a permissions, role, or approval model.
