---
type: TypeDefinition
defines: Comment
abstract: false
prefix: CM
dir: reviews
fields: {}
states:
  vocabulary: [posted, retired]
  initial: posted
  transitions:
    - { from: "*", to: retired }
  derived: false
links:
  parent: { target: [Review], max: 1 }   # FORMATS §9: "comments as CM-… children (links.parent)"
body:
  sections: []
json_schema: null
---
Comment: an engineering-mode review comment thread entry (RV-005), recorded as an artifact and
attached to its Review via `parent`.
