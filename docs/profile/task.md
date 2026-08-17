---
type: TypeDefinition
defines: Task
extends: WorkItem
abstract: false
prefix: TA
dir: tasks
fields:
  estimate: { kind: number, required: false }
  priority: { kind: enum, values: [p1, p2, p3], required: false }
  code: { kind: "list<string>", required: false }        # repo-relative globs (FORMATS §4);
                                                            # a FIELD, not a `links:` entry
  component: { kind: string, required: false }             # contract component name (TP-009)
states:
  vocabulary: [draft, ready, queued, building, done, rejected, retired]
  initial: draft
  transitions:
    - { from: draft,    to: ready,    gate: requirement-ready }  # generic well-formedness gate;
                                                                   # story-ready's doc/criteria-items
                                                                   # would fail Tasks (no Acceptance
                                                                   # criteria section, FORMATS §4)
    - { from: ready,    to: queued,   gate: plan }
    - { from: queued,   to: building }
    - { from: building, to: done,     gate: merge }          # VG-007: done needs merged code +
                                                                # passing verifying tests
    - { from: building, to: rejected }
    - { from: "*",      to: retired }
  derived: false
links:
  parent:      { target: [Story], max: 1 }        # ST-002 breakdown hierarchy
  depends_on:  { target: [Story, Task], cycles: forbid }
  verified_by: { target: [TestCase] }
body:
  sections: []
json_schema: null
---
Task: the unit an agent executes inside a stream (SPEC area ST, BD-006 task loop). `code` and
`component` are plain typed fields (FORMATS §4), not `links:` entries, per this batch's scope
decision. `chain/task-no-code` (a done Task whose `code` globs match nothing) is a merge-time
rule, not something declared on the transition itself.
