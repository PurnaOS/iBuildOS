---
type: ArtifactType
defines: Test
extends: WorkItem
description: A check that verifies a requirement.
fields:
  id:
    required: true
    pattern: "TEST-<slug>"
    doc: Stable identifier, e.g. TEST-orders-freshness.
  status:
    required: true
    one_of: [planned, automated, passing, failing]
    doc: planned → automated → passing/failing. Only `passing` closes the chain.
relationships:
  verifies:
    target: Requirement
    min: 1
    doc: The requirement(s) this test proves. A test must verify at least one.
---

# Test

A **Test** is the proof end of the chain. It `verifies` one or more
[Requirement](requirement.md)s; a Task points back to it with `verified_by`. Mark
it `passing` only when it actually passes — the gate trusts this status, so a lie
here is a lie in the graph.
