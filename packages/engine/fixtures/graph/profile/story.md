---
type: TypeDefinition
defines: Story
extends: WorkItem
abstract: false
prefix: ST
dir: stories
fields: {}
links:
  implements:  { target: [Requirement], min: 1 }
  depends_on:  { target: [Story], cycles: forbid }
  verified_by: { target: [TestCase], min: 1 }
body:
  sections:
    - { name: "Acceptance criteria", required: true, items: AC }
json_schema: null
---
Story: mini profile for graph/rules conformance fixtures. Deliberately drops
`honors`/`parent` from the FORMATS §5 worked example — this module's
fixtures never exercise DesignDirection/Epic, so they're not modeled here.
