---
type: TypeDefinition
defines: Review
abstract: false
prefix: RV
dir: reviews
fields:                        # FORMATS §9's Review row — the scalar-representable subset
  subject: { kind: id, required: true }
  verdict: { kind: enum, values: [accepted, changes, rejected, waived], required: true }
  mode:    { kind: enum, values: [product, engineering, dial-waived], required: true }
  commit:  { kind: string, required: true }
states:
  vocabulary: [recorded, retired]
  initial: recorded
  transitions:
    - { from: "*", to: retired }
  derived: false
links: {}   # comments attach to a Review via `Comment.links.parent` (inverse), not an
            # outgoing link declared here (FORMATS §9)
body:
  sections: []
json_schema: null
---
Review: the shared object behind Product-mode acceptance and Engineering-mode review (RV-001)
— one gate, two lenses. `criteria` (map `AC-n → pass|fail|waived`) is a structured field the
scalar dialect can't express; `packages/schemas` (`ReviewFrontmatterSchema`) validates it
directly. Comment children (`CM-…`) point back at a Review via `parent` — see `comment.md`.
