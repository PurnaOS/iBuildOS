---
type: TypeDefinition
defines: Runbook
abstract: false
prefix: RB
dir: architecture
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
Runbook: operational knowledge (how to run, roll back, investigate) linked to deploy targets
and surfaced beside deploy/trunk-broken flows (DA-004). Deploy targets are contract config
(TP-004), not artifacts, so no typed link is declared; see `architecture.md` for the same
reasoning on the requirements/components association.
