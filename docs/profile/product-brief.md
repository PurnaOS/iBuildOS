---
type: TypeDefinition
defines: ProductBrief
abstract: false
prefix: PB
dir: brief
fields: {}
states:
  vocabulary: [draft, active, retired]
  initial: draft
  transitions:
    - { from: draft, to: active }
    - { from: "*",   to: retired }
  derived: false
links: {}
body:
  sections: []
json_schema: null
---
ProductBrief: the vision document a Requirement hierarchy refines from (`traces_to`,
RQ-004) — SPEC.md §11's `Knowledge` category. No outgoing typed links of its own; it is the
top of the `traces_to` chain, referenced from `requirement.md`.
