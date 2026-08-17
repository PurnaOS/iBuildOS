---
type: Story
id: ST-0099
title: "Missing owner field"
state: draft
provenance: human
created: 2026-08-14
links:
  implements: [RQ-0007]
  verified_by: [TC-0001]
---

Triggers `doc/field-required` — the common frontmatter key `owner` (FORMATS
§4) is absent. Every other field is well-formed and the link targets exist,
so this scenario is expected to produce exactly one finding.

## Acceptance criteria
- [AC-1] Placeholder criterion.
