---
type: TypeDefinition
defines: Decision
abstract: false
prefix: DC
dir: decisions
fields: {}
states:
  vocabulary: [draft, proposed, accepted, rejected, superseded, retired]
  initial: draft
  transitions:
    - { from: draft,    to: proposed }
    - { from: proposed, to: accepted, approval: acceptance }
    - { from: proposed, to: rejected }
    - { from: accepted, to: superseded }
    - { from: "*",       to: retired }
  derived: false
links:
  constrains: { target: [Requirement, Story, Architecture] }   # DA-001; path target dropped —
                                                                  # scope cut for this batch, the
                                                                  # link-value schema only carries
                                                                  # artifact IDs/criterion refs
  supersedes: { target: [Decision] }
body:
  sections: []
json_schema: null
---
Decision (ADR): significant decisions captured directly, or promoted from an answered
decision card or a change rationale (DA-001), with `constrains` links to what they govern and
`supersedes` history. SPEC.md §11's relationship table also lists a bare-path target for
`constrains` (`Decision → .../path`); this batch declares only the artifact-typed targets
(`Requirement`/`Story`/`Architecture`) — the link-value schema doesn't yet carry bare
filesystem paths.
