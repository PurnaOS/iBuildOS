---
type: ArtifactType
defines: Persona
extends: WorkItem
description: A representative user the product serves.
fields:
  id:
    required: true
    pattern: "PERSONA-<slug>"
    doc: Stable identifier, e.g. PERSONA-data-engineer.
  status:
    required: true
    one_of: [draft, approved]
    doc: Document lifecycle.
  role:
    doc: Short role label, e.g. "On-call data engineer".
---

# Persona

A **Persona** describes a representative user — goals, context, pain points.
[Story](story.md) documents reference a persona via `persona`, which keeps the
"As a …" clause of every user story pointing at a real, shared definition instead
of an ad-hoc phrase.
