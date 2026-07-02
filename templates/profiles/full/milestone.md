---
type: ArtifactType
defines: Milestone
extends: WorkItem
description: A date-anchored checkpoint.
fields:
  id:
    required: true
    pattern: "MILE-<slug>"
    doc: Stable identifier, e.g. MILE-beta.
  status:
    required: true
    one_of: [upcoming, reached, missed]
    doc: Current state.
  target_date:
    required: true
    type: date
    doc: The date this milestone must be reached (ISO 8601).
relationships:
  requires:
    target: BacklogItem
    doc: Work that must be complete for this milestone (any work-item subtype).
---

# Milestone

A **Milestone** is a dated checkpoint — a beta, a launch, a compliance deadline.
`requires` points at the [BacklogItem](backlog-item.md)s (epics, stories, …) that
must be done by `target_date`, so the linter can flag a milestone at risk when its
required work is not on track.
