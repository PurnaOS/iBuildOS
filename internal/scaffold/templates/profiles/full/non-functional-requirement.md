---
type: ArtifactType
defines: NonFunctionalRequirement
extends: Requirement
description: A quality attribute or constraint the system must meet.
fields:
  id:
    required: true
    pattern: "NFR-<number>"
    doc: Stable identifier, e.g. NFR-0002.
  category:
    required: true
    one_of: [performance, security, scalability, reliability, usability, compliance, maintainability]
    doc: The quality attribute this requirement constrains.
relationships:
  derives_from:
    target: BusinessRequirement
    doc: The business requirement that motivates this constraint.
---

# NonFunctionalRequirement

A **NonFunctionalRequirement** (NFR) captures a quality attribute — performance,
security, reliability, and so on — rather than a feature. The required `category`
field keeps NFRs filterable and reportable, which is hard to do when they are
prose scattered through Confluence pages.
