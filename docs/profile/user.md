---
type: TypeDefinition
defines: User
abstract: false
prefix: US
dir: team
fields:
  email: { kind: string, required: false }   # git identity (TM-001) — the precise shape isn't
                                                # spelled out in FORMATS; judgment call
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
User: name (`title`) + git identity — attribution, not authorization (TM-001, D-113).
Referenced as `owner`/`assignee` across the profile via the common `US-…` ID form.
