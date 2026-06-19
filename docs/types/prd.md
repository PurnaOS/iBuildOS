---
type: ArtifactType
defines: PRD
extends: WorkItem
description: Product Requirements Document — scopes a product area into requirements.
fields:
  id:
    required: true
    pattern: "PRD-<number>"
    doc: Stable identifier, e.g. PRD-014.
  status:
    required: true
    one_of: [draft, in_review, approved, superseded]
    doc: Document lifecycle.
relationships:
  realizes:
    target: Vision
    max: 1
    doc: The vision this PRD advances.
---

# PRD

A **Product Requirements Document** frames a slice of product intent. Individual
[Requirement](requirement.md) documents `traces_to` a PRD, and the PRD itself
`realizes` a [Vision](vision.md). PRDs replace the requirement and spec pages
teams keep in Confluence — but here each requirement is its own linkable,
validatable artifact rather than a heading buried in a wiki page.
