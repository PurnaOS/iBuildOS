---
type: TypeDefinition
defines: Persona
abstract: false
prefix: PS
dir: personas
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
Persona: who a Requirement/Story `serves` (SPEC §11 relationship table; RQ-014). Elicited by
the requirements interview alongside design-direction artifacts. No outgoing typed links of
its own — it is always a link target, never a source, in the current relationship table.
