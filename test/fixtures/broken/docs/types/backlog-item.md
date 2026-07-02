---
type: ArtifactType
defines: BacklogItem
extends: WorkItem
abstract: true
description: Abstract base for schedulable work.
fields:
  priority:
    one_of: [must, should, could, wont]
---
