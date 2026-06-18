---
type: ArtifactType
defines: WorkItem
abstract: true
description: Abstract base for owned, lifecycled artifacts.
fields:
  id:
    required: true
  title:
    required: true
  owner:
    required: true
  status:
    required: true
---
