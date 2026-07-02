---
type: ArtifactType
defines: ADR
extends: WorkItem
description: An Architecture Decision Record — a decision, its context, and consequences (MADR-style).
fields:
  id:
    required: true
    pattern: "ADR-<number>"
    doc: Stable identifier, e.g. ADR-0001.
  status:
    required: true
    one_of: [proposed, accepted, superseded, rejected, deprecated]
    doc: Decision lifecycle.
relationships:
  supersedes:
    target: ADR
    max: 1
    doc: A prior decision this one replaces (decision history).
  affects:
    target: Requirement
    doc: Requirement(s) or area(s) this decision constrains.
---

# ADR

An **Architecture Decision Record** captures a decision, the context that forced
it, and its consequences. A superseded decision links to its successor via
`supersedes`, and `affects` ties a decision to what it constrains — keeping
decisions inside the same traceability graph as requirements and work. The
project's own decisions (D-001…) are promoted to ADRs as the bundle grows.
