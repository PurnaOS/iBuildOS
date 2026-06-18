---
type: ArtifactType
defines: Bug
extends: BacklogItem
description: A defect — behaviour that violates a requirement.
fields:
  id:
    required: true
    pattern: "BUG-<number>"
    doc: Stable identifier, e.g. BUG-417.
  status:
    required: true
    one_of: [open, in_progress, resolved, closed, wont_fix]
    doc: Current state.
  severity:
    one_of: [blocker, critical, major, minor, trivial]
    doc: Impact severity.
relationships:
  parent:
    target: Epic
    max: 1
    doc: Optional epic this bug is grouped under.
  affects:
    target: Requirement
    doc: The requirement(s) whose behaviour is violated.
  verified_by:
    target: Test
    doc: Regression test(s) proving the fix.
---

# Bug

A **Bug** is a defect against expected behaviour. Linking `affects` to the
[Requirement](requirement.md) it violates keeps defects inside the same
traceability graph as features, and `verified_by` ties the fix to a regression
[Test](test.md).
