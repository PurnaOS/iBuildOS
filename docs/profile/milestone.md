---
type: TypeDefinition
defines: Milestone
abstract: false
prefix: MS
dir: releases
fields:
  target_date: { kind: date, required: false }   # inferred by analogy to Release's DR-001
                                                    # target_date — not spelled out for
                                                    # Milestone explicitly; judgment call
states:
  vocabulary: [draft, planned, reached, retired]
  initial: draft
  transitions:
    - { from: draft,   to: planned }
    - { from: planned, to: reached }
    - { from: "*",     to: retired }
  derived: false
links: {}
body:
  sections: []
json_schema: null
---
Milestone: a time-based grouping alongside Release (SPEC §11's `Flow` category;
`Story/Bug.planned_for → Release/Milestone`). Declares no outgoing typed link itself — it is
always a `planned_for` target.
