---
type: ArtifactType
defines: Requirement
extends: WorkItem
description: A statement of need the system must satisfy.
fields:
  id:
    required: true
    pattern: "REQ-<number>"
    doc: Stable identifier, e.g. REQ-007.
  status:
    required: true
    one_of: [proposed, accepted, implemented, deprecated]
    doc: proposed (idea) → accepted (committed) → implemented → deprecated.
  priority:
    one_of: [must, should, could, wont]
    doc: MoSCoW priority. Optional.
---

# Requirement

A **Requirement** is a single need the system must satisfy — written so it can be
implemented and verified. Work `implements` it; a [Test](test.md) (or Scenario, in
the full profile) `verifies` it. Once `accepted`, the linter expects both: an
implementer and a verifier.

The core profile keeps requirements flat — one type. The full profile splits them
into Business / Functional / NonFunctional and adds the Vision → PRD chain above
them; switch with `iBuild init --full` or add those type files when you need them.
