---
type: ArtifactType
defines: Requirement
extends: WorkItem
abstract: true
description: Abstract base for a statement of need the system must satisfy.
fields:
  id:
    required: true
    doc: Stable identifier. Concrete subtypes set their own prefix (BR-, FR-, NFR-).
  status:
    required: true
    one_of: [proposed, accepted, implemented, deprecated]
    doc: Lifecycle of the requirement.
  priority:
    one_of: [must, should, could, wont]
    doc: MoSCoW priority.
relationships:
  traces_to:
    target: PRD
    max: 1
    doc: The product requirements document this requirement derives from.
---

# Requirement

An abstract base (never used directly) for the three concrete requirement kinds:
[BusinessRequirement](business-requirement.md),
[FunctionalRequirement](functional-requirement.md), and
[NonFunctionalRequirement](non-functional-requirement.md). It is the hub of the
traceability graph — Epics and Stories `implements` requirements, and Tests
`verifies` them.

Because relationships that target `Requirement` accept any of its subtypes (see
[ArtifactType](artifact-type.md)), a Story implementing an `FR-` document
satisfies a `target: Requirement` link.

A requirement at status `accepted` with nothing implementing or verifying it is
an orphan the validator flags.
