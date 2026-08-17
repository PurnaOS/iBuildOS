---
type: TypeDefinition
defines: Team
abstract: false
prefix: TM
dir: team
fields:
  members: { kind: "list<id>", required: false }   # US-… ids; not spelled out precisely in
                                                       # FORMATS/SPEC — judgment call
states:
  vocabulary: [active, retired]
  initial: active
  transitions:
    - { from: active, to: retired }
  derived: false
links: {}
body:
  sections: []
json_schema: null
---
Team: groups Users for ownership/assignment (TM-001). `members` is a plain typed field (a list
of `US-…` ids) rather than a `links:` entry, kept symmetric with how ownership/assignment
reference identity elsewhere in the profile.
