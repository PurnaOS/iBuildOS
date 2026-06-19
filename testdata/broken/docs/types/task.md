---
type: ArtifactType
defines: Task
extends: BacklogItem
description: The smallest unit of executable work.
fields:
  id:
    required: true
    pattern: "TASK-<number>"
  status:
    required: true
    one_of: [todo, in_progress, blocked, done]
  code:
    type: list
relationships:
  implements:
    target: Requirement
  verified_by:
    target: Test
---
