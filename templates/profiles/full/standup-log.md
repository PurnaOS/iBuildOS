---
type: ArtifactType
defines: StandupLog
extends: WorkItem
description: A standup log entry, captured as version-controlled team memory.
fields:
  id:
    required: true
    pattern: "STANDUP-<slug>"
    doc: Stable identifier, e.g. STANDUP-2026-06-30.
  status:
    required: true
    one_of: [logged]
    doc: Lifecycle (logged once recorded).
  date:
    type: date
    doc: The standup date.
---

# StandupLog

A **StandupLog** records a standup as a linkable artifact, so what the team said
it would do is part of the repo's memory rather than ephemeral chat.
