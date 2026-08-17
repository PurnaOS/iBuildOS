---
type: TypeDefinition
defines: Story            # the type name artifacts use
extends: WorkItem         # inherits fields/links/states; overrides merge by key
abstract: false
prefix: ST                # ID prefix (§2)
dir: stories               # bundle directory (§3)
fields:                   # beyond inherited; key = frontmatter key
  estimate: { kind: number, required: false }
  priority: { kind: enum, values: [p1, p2, p3], required: false }
states:
  vocabulary: [draft, ready, queued, building, review, accepted, done, rejected, retired]
  initial: draft
  transitions:            # absent pair = illegal transition (rule state/legal)
    - { from: draft,    to: ready,    gate: story-ready }
    - { from: ready,    to: queued,   gate: plan }
    - { from: queued,   to: building }
    - { from: building, to: review,   gate: stream-done }
    - { from: review,   to: accepted, approval: acceptance }   # dial-waivable (D-115)
    - { from: review,   to: building }                          # request changes
    - { from: review,   to: rejected }
    - { from: accepted, to: done,     gate: merge }
    - { from: [accepted, done], to: review }                    # CH-005 re-verification
    - { from: "*",      to: retired }
  derived: false          # true for Requirement post-ready states (RQ-008)
links:
  implements: { target: [Requirement], min: 1 }
  depends_on: { target: [Story, Task], cycles: forbid }
  verified_by: { target: [TestCase], min: 1 }
  honors:     { target: [DesignDirection] }
  parent:     { target: [Epic], max: 1 }
  planned_for: { target: [Release, Milestone] }   # SPEC §11 relationship table (1.1, G-26)
  serves:      { target: [Persona] }              # SPEC §11 relationship table (1.1)
body:
  sections:
    - { name: "Acceptance criteria", required: true, items: AC }  # items ⇒ [AC-n] IDs
json_schema: null         # escape hatch (KB-004): inline JSON Schema applied to frontmatter
---
Story: a user-valued slice of a requirement. See SPEC area ST. This file reproduces
FORMATS.md §5's worked example verbatim (it is named `docs/profile/story.md` there and marked
"normative for the dialect") and adds the two SPEC.md §11 relationships (`planned_for`,
`serves`) the worked example omitted for brevity.
