---
type: ArtifactType
defines: RetroAction
extends: WorkItem
description: An action item from a retrospective, tracked to completion.
fields:
  id:
    required: true
    pattern: "RETRO-<number>"
    doc: Stable identifier, e.g. RETRO-0007.
  status:
    required: true
    one_of: [open, in_progress, done]
    doc: Action lifecycle.
---

# RetroAction

A **RetroAction** is a follow-up committed to in a retrospective. It inherits
`assignee` from [WorkItem](work-item.md) so the action lands on a named
[Actor](actor.md), and is tracked to `done` rather than lost in chat.
