---
type: TypeDefinition
defines: Change
abstract: false
prefix: CH
dir: changes
fields: {}     # ChangeFrontmatterSchema (packages/schemas) carries no keys beyond common —
               # a Change's substance is its `links.affects` and its four body sections
states:
  vocabulary: [proposed, planning, applied, rejected, retired]
  initial: proposed
  transitions:
    - { from: proposed, to: planning }
    - { from: planning, to: applied,  approval: acceptance }   # CH-004: applied transactionally
                                                                  # on approval
    - { from: planning, to: rejected }
    - { from: "*",       to: retired }
  derived: false
links:
  affects: { target: [Requirement, Story] }
body:
  sections:
    - { name: "Why",     required: true }
    - { name: "Before",  required: true }
    - { name: "After",   required: true }
    - { name: "Re-plan", required: true }
json_schema: null
---
Change: the recorded evolution of a requirement/story mid-build (CH area) — what changed
(before/after), why, and the downstream re-plan, captured as one reviewable change-set applied
transactionally on approval (CH-004). Body sections per FORMATS §9's Change row.
