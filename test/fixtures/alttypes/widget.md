---
type: ArtifactType
defines: Widget
description: An alternative type set, unrelated to the SDLC profile, proving the
  engine is fully data-driven — different docs/types yields different enforcement
  with zero code change.
fields:
  sku:
    required: true
    pattern: "W-<number>"
  status:
    required: true
    one_of: [open, closed]
---
