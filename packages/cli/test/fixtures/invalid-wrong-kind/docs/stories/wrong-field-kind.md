---
type: Story
id: ST-0098
title: "Estimate has the wrong kind"
state: draft
owner: US-0001
provenance: human
created: 2026-08-14
estimate: "three"
links:
  implements: [RQ-0007]
  verified_by: [TC-0001]
---

Triggers `doc/field-kind` — `estimate` is declared `{ kind: number }` in
docs/profile/story.md but this document supplies a string. Every other field
is well-formed and the link targets exist, so this scenario is expected to
produce exactly one finding.

## Acceptance criteria
- [AC-1] Placeholder criterion.
