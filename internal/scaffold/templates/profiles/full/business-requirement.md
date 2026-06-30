---
type: ArtifactType
defines: BusinessRequirement
extends: Requirement
description: A need expressed in business terms.
fields:
  id:
    required: true
    pattern: "BR-<number>"
    doc: Stable identifier, e.g. BR-0003.
---

# BusinessRequirement

A **BusinessRequirement** states a need in business/outcome terms. It inherits
`status`, `priority`, and `traces_to` (→ [PRD](prd.md)) from
[Requirement](requirement.md). [FunctionalRequirement](functional-requirement.md)
and [NonFunctionalRequirement](non-functional-requirement.md) documents
`derives_from` a business requirement, and [Initiative](initiative.md)s
`traces_to` them — so business intent links all the way down to delivered work.
