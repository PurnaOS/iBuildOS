---
type: ArtifactType
defines: Requirement
extends: WorkItem
abstract: true
description: Abstract base for a statement of need.
fields:
  status:
    required: true
    one_of: [proposed, accepted, implemented, deprecated]
---
