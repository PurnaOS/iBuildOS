---
type: ArtifactType
defines: MeetingNote
extends: WorkItem
description: A captured meeting/decision note, so coordination memory lives in the repo rather than chat.
fields:
  id:
    required: true
    pattern: "MEET-<slug>"
    doc: Stable identifier, e.g. MEET-2026-06-30-planning.
  status:
    required: true
    one_of: [draft, published]
    doc: Document lifecycle.
  date:
    type: date
    doc: When the meeting took place.
---

# MeetingNote

A **MeetingNote** captures a meeting or decision as a linkable, version-controlled
artifact. Optional team-coordination memory — teams that do not want it can drop
this type from their profile.
