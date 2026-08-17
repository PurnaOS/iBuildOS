---
type: TypeDefinition
defines: Spike
extends: WorkItem
abstract: false
prefix: SK
dir: bugs
fields:
  estimate: { kind: number, required: false }
  priority: { kind: enum, values: [p1, p2, p3], required: false }
states:
  # SPEC.md §11 lists Spike only as a Work-category sibling of Task/Bug; FORMATS.md §4
  # groups it with Story/Task/Bug/Epic for the shared estimate/priority/claim fields and
  # §2 gives it prefix SK, but neither document details its lifecycle or links. Modeled
  # here as a lightweight, timeboxed research task under a Story — no `code`/`verified_by`
  # (a spike's output is a finding, not shipped code) and no merge gate on completion.
  # Judgment call, not spec-mandated.
  vocabulary: [draft, ready, queued, building, done, rejected, retired]
  initial: draft
  transitions:
    - { from: draft,    to: ready,    gate: requirement-ready }
    - { from: ready,    to: queued,   gate: plan }
    - { from: queued,   to: building }
    - { from: building, to: done }
    - { from: building, to: rejected }
    - { from: "*",      to: retired }
  derived: false
links:
  parent:     { target: [Story], max: 1 }
  depends_on: { target: [Story, Task], cycles: forbid }
body:
  sections: []
json_schema: null
---
Spike: a timeboxed research/exploration work item, sharing WorkItem's estimate/priority and
prefix `SK` (FORMATS §2/§4). SPEC.md §11 doesn't detail its relationships beyond listing it
alongside Task/Bug in the `Work` category — the `parent`/`depends_on` shape here mirrors
Task's by analogy; this is a judgment call, not a spec-mandated relationship.
