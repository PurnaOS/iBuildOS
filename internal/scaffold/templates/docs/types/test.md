---
type: ArtifactType
defines: Test
extends: WorkItem
description: A check that verifies a requirement is satisfied.
fields:
  id:
    required: true
    pattern: "TEST-<slug>"
    doc: Stable unique identifier, e.g. TEST-orders-freshness.
  status:
    required: true
    one_of: [planned, automated, passing, failing]
    doc: Current state of the test.
relationships:
  verifies:
    target: Requirement
    min: 1
    doc: The requirement(s) this test proves are satisfied.
---

# Test

A **Test** proves that a [Requirement](requirement.md) is satisfied. It must
`verifies` at least one requirement.

Two situations are gaps the validator reports: a requirement with no test
verifying it, and a Task marked `done` whose `verified_by` tests are not yet
`passing`.
