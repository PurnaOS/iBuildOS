---
type: TypeDefinition
defines: Requirement
extends: WorkItem
abstract: false
prefix: RQ
dir: requirements
fields: {}
links: {}
states:
  vocabulary: [draft, ready, approved, retired]
  initial: draft
  transitions:
    - { from: draft, to: ready }
    - { from: ready, to: approved }
    - { from: "*",   to: retired }
  derived: false
body:
  sections:
    - { name: "Acceptance criteria", required: true, items: AC }
json_schema: null
---
Requirement: concrete (unlike fixtures/profile/requirement.md's abstract
stub), so chain/req-unimplemented has a real Requirement instance to flag.
