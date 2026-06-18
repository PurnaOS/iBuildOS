---
type: ArtifactType
defines: FunctionalRequirement
extends: Requirement
description: A specific behaviour the system must provide.
fields:
  id:
    required: true
    pattern: "FR-<number>"
    doc: Stable identifier, e.g. FR-0007.
relationships:
  derives_from:
    target: BusinessRequirement
    doc: The business requirement this functional requirement refines.
---

# FunctionalRequirement

A **FunctionalRequirement** describes a concrete behaviour ("the system shall…").
It refines a [BusinessRequirement](business-requirement.md) via `derives_from`,
and is what [Epic](epic.md)s and [Story](story.md)s most often `implements`.
