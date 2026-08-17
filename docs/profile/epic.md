---
type: TypeDefinition
defines: Epic
extends: WorkItem
abstract: false
prefix: EP
dir: epics
fields:
  estimate: { kind: number, required: false }
  priority: { kind: enum, values: [p1, p2, p3], required: false }
states:
  vocabulary: [draft, ready, active, done, retired]
  initial: draft
  transitions:
    - { from: draft,   to: ready,  gate: requirement-ready }
    - { from: ready,   to: active }
    - { from: active,  to: done }
    - { from: "*",     to: retired }
  derived: false
links:
  implements: { target: [Requirement], min: 1 }   # ST-001: implements directly, or via Epic
body:
  sections: []
json_schema: null
---
Epic: optional grouping above Story (SPEC §11's `Work` category; ST-001 "direct or via an
optional epic grouping"). Its own lifecycle is lighter than Story's — no review/acceptance
ceremony of its own; a coarse draft → ready → active → done arc tracking the stories it
groups.
