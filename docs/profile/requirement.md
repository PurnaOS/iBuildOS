---
type: TypeDefinition
defines: Requirement
abstract: false
prefix: RQ
dir: requirements
fields:
  kind: { kind: enum, values: [functional, nonfunctional], required: true }
states:
  vocabulary: [draft, ready, building, built, verified, retired]
  initial: draft
  transitions:
    - { from: draft,    to: ready,     gate: requirement-ready }
    - { from: ready,    to: building }                              # derived (RQ-008)
    - { from: building, to: built }                                 # derived (RQ-008)
    - { from: built,    to: verified }                               # derived (RQ-008)
    - { from: "*",      to: retired }
  derived: true    # post-`ready` states (building/built/verified) are computed from
                    # implementing work, never hand-edited (RQ-008; state/derived rule)
links:
  traces_to:  { target: [ProductBrief, Requirement] }   # hierarchy (1.1, RQ-004)
  supersedes: { target: [Requirement] }
  serves:     { target: [Persona] }
body:
  sections:
    - { name: "Acceptance criteria", required: true, items: AC }
json_schema: null
---
Requirement: functional or nonfunctional (`kind`), the type FORMATS.md §4 names alongside
Story as carrying required acceptance criteria. `states.derived: true` marks this as the type
FORMATS §5's Story worked example calls out by name — the post-`ready` states are computed
automatically from implementing Story/Task status (any queued/building work → `building`; all
implementing stories done → `built`; verifying tests passing → `verified`); gates that require
a "ready" requirement accept `ready` or any later non-retired state (VG-006, PL-007).
