---
type: TypeDefinition
defines: TestCase
abstract: false
prefix: TC
dir: tests
fields:
  kind: { kind: enum, values: [manual, automated], required: true }   # TD-001
states:
  vocabulary: [draft, active, retired]
  initial: draft
  transitions:
    - { from: draft, to: active }
    - { from: "*",   to: retired }
  derived: false
links:
  verifies:   { target: [Requirement, Story, Bug] }   # + individual criteria (ID#AC-n) on
                                                         # the same three types (TD-001; ST-009
                                                         # regression tests verify a Bug)
  member_of:  { target: [TestSuite] }                  # TD-009 suite membership
body:
  sections: []
json_schema: null
---
TestCase: manual or automated (`kind`), with `verifies` links to requirements, stories, or
individual acceptance criteria (`ID#AC-n`, FORMATS §2) — and, for regression tests, to the Bug
they guard (ST-009). `binding` (automated: `{file, pattern?}`, FORMATS §4) is a structured
field the scalar dialect can't express — same treatment as `claim` on `work-item.md`.
