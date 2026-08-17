---
type: TypeDefinition
defines: Run
abstract: false
prefix: RN
dir: runs
fields:                       # FORMATS §9's Run row — the scalar-representable subset
  agent:   { kind: string, required: true }              # identity string, §10
  role:    { kind: string, required: false }              # AC-008 role
  stream:  { kind: string, required: false }              # nonce, or absent
  subject: { kind: "list<string>", required: true }        # ST/TA/CH/BG ids, or the sentinel
                                                              # strings "merge"/"adoption"/
                                                              # "interview" — a FIELD (`string`,
                                                              # not `id`, precisely because of the
                                                              # sentinels), not a `links:` entry
  started: { kind: string, required: true }                # ISO-8601
  ended:   { kind: string, required: false }               # ISO-8601
  outcome: { kind: enum, values: [done, failed, aborted, superseded], required: false }
  transcript: { kind: string, required: false }            # ibos-transcript:// URI
states:
  vocabulary: [recorded, retired]
  initial: recorded
  transitions:
    - { from: "*", to: retired }
  derived: false
links: {}    # `result_of` (Run → Story/Task/Change/merge/adoption, SPEC §11) is realized as
             # the `subject` field above, not a `links:` entry (FORMATS §9)
body:
  sections: []
json_schema: null
---
Run: the cross-machine audit record of one agent execution (AC-012) — the body carries the
agent's summary. `gates` (map gate → `green|red`) is a structured field the scalar dialect
can't express; `packages/schemas` (`RunFrontmatterSchema`) validates it directly.
