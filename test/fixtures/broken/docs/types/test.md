---
type: ArtifactType
defines: Test
extends: WorkItem
description: A check that verifies a requirement.
fields:
  id:
    required: true
    pattern: "TEST-<slug>"
  status:
    required: true
    one_of: [planned, automated, passing, failing]
relationships:
  verifies:
    target: Requirement
    min: 1
---
