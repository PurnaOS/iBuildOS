---
type: ArtifactType
defines: Roadmap
extends: WorkItem
description: A time-ordered plan of initiatives.
fields:
  id:
    required: true
    pattern: "ROAD-<slug>"
    doc: Stable identifier, e.g. ROAD-2026.
  status:
    required: true
    one_of: [draft, active, archived]
    doc: Current state.
  horizon:
    doc: The planning horizon, e.g. "2026-H2".
relationships:
  includes:
    target: Initiative
    doc: The initiatives sequenced on this roadmap.
---

# Roadmap

A **Roadmap** sequences [Initiative](initiative.md)s over a planning `horizon`.
It is the planning view that, in Jira/Confluence, lives in a separate roadmap tool
or a slide deck — here it is a versioned artifact that links to the real
initiatives, so it cannot drift out of sync with the work.
