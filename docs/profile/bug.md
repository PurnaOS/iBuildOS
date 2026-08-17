---
type: TypeDefinition
defines: Bug
extends: WorkItem
abstract: false
prefix: BG
dir: bugs
fields:
  estimate: { kind: number, required: false }
  priority: { kind: enum, values: [p1, p2, p3], required: false }
  severity: { kind: enum, values: [blocker, major, minor], required: false }
states:
  # ST-009: bugs "enter the same breakdown → build → verify loop" as stories, so the
  # pipeline mirrors Story's — but Bug carries no required Acceptance-criteria body
  # section (FORMATS §4 lists only Requirement/Story there), so `story-ready` (which
  # binds `doc/criteria-items`) would be unsatisfiable; `requirement-ready` is reused
  # instead as the generic well-formedness gate. Judgment call — SPEC doesn't spell out
  # Bug's status vocabulary explicitly.
  vocabulary: [draft, ready, queued, building, review, accepted, done, rejected, retired]
  initial: draft
  transitions:
    - { from: draft,    to: ready,    gate: requirement-ready }
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
links:
  affects:     { target: [Requirement, Story] }
  fixed_by:    { target: [Task] }
  planned_for: { target: [Release, Milestone] }
body:
  sections:
    - { name: "Reproduction", required: false }   # FORMATS §4: "repro in body" (not required)
json_schema: null
---
Bug: a defect entering the same breakdown → build → verify loop as a Story (ST-009), with a
regression test (`TestCase.verifies → Bug`) required before its fix's merge gate passes
(`chain/bug-regression`, bound to `merge` in `gates.yaml`).
