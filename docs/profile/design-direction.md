---
type: TypeDefinition
defines: DesignDirection
abstract: false
prefix: DD
dir: design
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
DesignDirection: styleguide/brand/key-screens/tone artifacts a Story must `honor` (RQ-014,
G-31) — project-level session context injected into every implementer stream, not only
streams linked to one requirement. No outgoing typed links of its own; attachments (mockups)
live beside it under `docs/design/assets/<id>/…` (FORMATS §3).
