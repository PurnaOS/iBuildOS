---
type: TypeDefinition
defines: Deploy
abstract: false
prefix: DP
dir: releases
fields:                      # FORMATS §9's Deploy row — the scalar-representable subset
  target:      { kind: string, required: true }
  environment: { kind: string, required: true }
  commit:      { kind: string, required: true }
  by:          { kind: id, required: true }         # US-… (FORMATS §9)
  url:         { kind: string, required: false }
  outcome:     { kind: string, required: true }
states:
  vocabulary: [recorded, retired]
  initial: recorded
  transitions:
    - { from: "*", to: retired }
  derived: false
links:
  result_of: { target: [Release] }   # FORMATS §9: "Deploy: ... links.result_of: [RL-…]"
body:
  sections: []
json_schema: null
---
Deploy: what/where/when/by whom for a one-click delivery via the project contract (DR-003) —
the only flow-record type whose `result_of` relationship is realized as a `links:` entry
rather than a plain field (contrast `run.md`/`test-result.md`).
