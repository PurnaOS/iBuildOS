---
type: TypeDefinition
defines: Release
abstract: false
prefix: RL
dir: releases
fields:
  target_date: { kind: date, required: false }   # DR-001
states:
  vocabulary: [draft, planned, released, retired]
  initial: draft
  transitions:
    - { from: draft,   to: planned }
    - { from: planned, to: released, gate: release-deploy }   # DR-004: release/deploy gate
                                                                 # evaluated before release
    - { from: "*",     to: retired }
  derived: false
links: {}
body:
  sections: []
json_schema: null
---
Release: groups stories via the inverse of `Story.planned_for`, with readiness computed from
the graph — scope built/verified/accepted, open bugs, gate status (DR-002) — never
hand-maintained. Declares no outgoing typed link itself; `Deploy.result_of` and
`Story/Bug.planned_for` point at it.
