---
type: ArtifactType
defines: Initiative
extends: BacklogItem
description: A large strategic objective spanning multiple epics.
fields:
  id:
    required: true
    pattern: "INIT-<number>"
    doc: Stable identifier, e.g. INIT-007.
  status:
    required: true
    one_of: [proposed, active, done, cancelled]
    doc: Current state.
relationships:
  traces_to:
    target: BusinessRequirement
    doc: The business requirement(s) this initiative addresses.
  realized_by:
    target: Epic
    doc: The epics that deliver this initiative.
---

# Initiative

An **Initiative** is the top of the work-breakdown hierarchy — a strategic
objective realised by several [Epic](epic.md)s and tied to business intent via
`traces_to` a [BusinessRequirement](business-requirement.md). Initiatives are what
a [Roadmap](roadmap.md) sequences.
