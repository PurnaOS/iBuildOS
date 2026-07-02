---
type: ArtifactType
defines: Bug
extends: WorkItem
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
    doc: Impact severity. Optional.
relationships:
  affects:
    target: Requirement
    doc: The requirement(s) whose behaviour is violated.
  verified_by:
    target: Test
    doc: Regression test(s) proving the fix.
  parent:
    target: WorkItem
    max: 1
    doc: Optional parent for grouping.
---

# Bug

A **Bug** keeps a defect in the same graph as the feature it broke: it `affects`
the [Requirement](requirement.md) it violates and is `verified_by` a regression
[Test](test.md) that fails before the fix and passes after. A `resolved` Bug
should carry a `passing` test, or the graph is lying.
