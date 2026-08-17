---
type: TypeDefinition
defines: WorkItem
abstract: true              # not directly usable by artifacts (FORMATS §5 dialect semantics)
fields:                     # shared across Story/Task/Bug/Epic/Spike (FORMATS §4)
  estimate: { kind: number, required: false }
  priority: { kind: enum, values: [p1, p2, p3], required: false }
links: {}
body:
  sections: []
json_schema: null
---
WorkItem: abstract base for Story/Task/Bug/Epic/Spike — SPEC.md §11's `Work` category
(assignee, priority, estimate). Declares `estimate`/`priority` once so every concrete Work
type inherits them (`ProfileRegistry.resolve` merges fields by key, child wins); each
subtype's own file may still redeclare a field (as `story.md` does, matching FORMATS.md §5's
worked example verbatim) with no conflict — identical values simply overwrite.

The `claim` key (`{by, machine, at}`, written by BD-017, cleared at landing — FORMATS §4) is a
common structured field on every Work type. The scalar field dialect (`fields:` kind ∈
`string|number|boolean|date|enum|id|list<...>`) cannot express an object shape, so `claim` is
not declared here or on any subtype — `packages/schemas` (`ClaimSchema`) validates it directly,
the same escape taken for `generated`/`sources`/`external`/`tags` on every artifact type.
