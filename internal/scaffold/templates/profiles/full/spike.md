---
type: ArtifactType
defines: Spike
extends: BacklogItem
description: A time-boxed investigation to reduce uncertainty.
fields:
  id:
    required: true
    pattern: "SPIKE-<number>"
    doc: Stable identifier, e.g. SPIKE-012.
  status:
    required: true
    one_of: [todo, in_progress, done]
    doc: Current state.
  timebox:
    doc: The agreed time budget, e.g. "2 days".
relationships:
  parent:
    target: Epic
    max: 1
    doc: Optional epic this spike supports.
  informs:
    target: Requirement
    doc: Requirement(s) or decisions this research will inform.
---

# Spike

A **Spike** is a time-boxed research task used to answer a question before
committing to delivery. The `timebox` field keeps it bounded, and `informs`
records which [Requirement](requirement.md)s or decisions the findings feed.
