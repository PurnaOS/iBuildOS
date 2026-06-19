---
type: ArtifactType
defines: Persona
extends: WorkItem
description: A representative user.
fields:
  id:
    required: true
    pattern: "PERSONA-<slug>"
  status:
    required: true
    one_of: [draft, approved]
  role:
    doc: Short role label.
---
