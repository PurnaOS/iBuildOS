---
type: TypeDefinition
defines: TestSuite
abstract: false
prefix: SU
dir: tests
fields: {}
states:
  vocabulary: [draft, active, retired]
  initial: draft
  transitions:
    - { from: draft, to: active }
    - { from: "*",   to: retired }
  derived: false
links: {}
body:
  sections: []
json_schema: null
---
TestSuite: a named group of test cases (release regression, smoke, feature pass — TD-009).
Membership is the inverse of `TestCase.member_of`: a suite carries no outgoing `links` entry
of its own (FORMATS §4: "TestSuite: members via `links.member_of` inverse").
