---
type: TypeDefinition
defines: Architecture
abstract: false
prefix: AR
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
Architecture: system structure, component responsibilities, text-based diagram sources
(DA-003) — linked to contract components (TP-009, not an artifact type) and requirements.
SPEC.md §11's Core typed relationships table names no outgoing relationship with Architecture
as the source (only as a `constrains` target from Decision), so no link is declared here; a
project profile may extend this with its own relationship as needed (KB-004).
