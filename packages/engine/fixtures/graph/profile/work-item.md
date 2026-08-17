---
type: TypeDefinition
defines: WorkItem
abstract: true
fields: {}
links: {}
states:
  vocabulary: [draft, ready, queued, building, review, accepted, done, rejected, retired]
  initial: draft
  transitions:
    - { from: draft,    to: ready,    gate: story-ready }
    - { from: ready,    to: queued,   gate: plan }
    - { from: queued,   to: building }
    - { from: building, to: review,   gate: stream-done }
    - { from: review,   to: accepted, approval: acceptance }
    - { from: review,   to: building }
    - { from: review,   to: rejected }
    - { from: accepted, to: done,     gate: merge }
    - { from: [accepted, done], to: review }
    - { from: "*",      to: retired }
  derived: false
body:
  sections: []
json_schema: null
---
WorkItem: minimal abstract base for the graph/rules module's own conformance
fixtures (packages/engine/src/graph, src/rules/{links,state,chain,doc-structure}.ts).

Deliberately a *separate* mini profile from `fixtures/profile/*` — that set
is off-limits to modify (CLAUDE.md boundaries) and doesn't fit this module's
needs as-is: its `Requirement` is abstract (chain/req-unimplemented needs a
concrete one to flag) and its `Task` has no `code` field (chain/task-no-code
needs one). This profile is self-contained and only used by tests under
`fixtures/graph/**`.
