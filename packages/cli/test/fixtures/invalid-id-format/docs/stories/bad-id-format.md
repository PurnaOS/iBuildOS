---
type: Story
id: STORY-42
title: "Malformed ID"
state: draft
owner: US-0001
provenance: human
created: 2026-08-14
links:
  implements: [RQ-0007]
  verified_by: [TC-0001]
---

Triggers `id/format` — `STORY-42` does not match `<PREFIX>-<NNNN>` (FORMATS §2:
a two-letter prefix from the table, hyphen, a zero-padded 4+ digit number).
Every other field is deliberately well-formed, and the `implements`/
`verified_by` targets exist, so this scenario is expected to produce exactly
one finding.

## Acceptance criteria
- [AC-1] Placeholder criterion.
