---
type: TypeDefinition
defines: TestResult
abstract: false
prefix: TR
dir: results
fields:                      # beyond common keys — FORMATS §9's flow-record table; the
                              # scalar-representable subset (see body note for the rest)
  subject: { kind: id, required: true }        # TC or SU id
  commit:  { kind: string, required: true }
  verdict: { kind: enum, values: [pass, fail, skip], required: true }
  kind:    { kind: enum, values: [automated, manual], required: true }
  evidence: { kind: "list<string>", required: false }   # relative asset links
states:
  vocabulary: [recorded, retired]
  initial: recorded
  transitions:
    - { from: "*", to: retired }
  derived: false
links: {}    # `result_of` (TestResult → TestCase/TestSuite, SPEC §11) is realized as the
             # `subject` field above, not a `links:` entry (FORMATS §9)
body:
  sections: []
json_schema: null
---
TestResult: an execution record (TX-004) — what ran, against which commit, verdict, evidence.
`cases` (suite runs: map `TC → verdict`) is a structured field the scalar dialect can't
express; `packages/schemas` (`TestResultFrontmatterSchema`) validates it directly. Immutable
once recorded — its `state` lifecycle is trivial (`recorded` → `retired`), unlike the
Work/Knowledge types with real workflow.
