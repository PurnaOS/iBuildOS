---
type: ArtifactType
defines: Vision
extends: WorkItem
description: The product vision and strategy — the top of the knowledge tree.
fields:
  id:
    required: true
    pattern: "VIS-<slug>"
    doc: Stable identifier, e.g. VIS-platform.
  status:
    required: true
    one_of: [draft, approved, archived]
    doc: Document lifecycle.
---

# Vision

A **Vision** captures product strategy and direction — the "why" everything else
traces back to. [PRD](prd.md) documents `realizes` a Vision, and
[BusinessRequirement](business-requirement.md)s ultimately ladder up to it. This
is part of the knowledge layer that replaces strategy pages in Confluence.
