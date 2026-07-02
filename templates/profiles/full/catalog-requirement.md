---
type: ArtifactType
defines: CatalogRequirement
extends: Requirement
description: A requirement carried with its stable catalog ID (AREA-NNN), as in a master requirements specification.
fields:
  id:
    required: true
    pattern: "regex:[A-Z]{2,3}-[0-9]{3,}"
    doc: Stable catalog identifier, e.g. KS-001, VL-013, NFR-007.
  status:
    required: true
    one_of: [draft, accepted, implemented, deprecated]
    doc: draft (catalogued, not yet scheduled — draws no chain findings) → accepted (committed, must be implemented + verified) → implemented → deprecated.
  area:
    doc: Capability-area code, e.g. KS, VL, NFR.
---

# CatalogRequirement

A **CatalogRequirement** is a requirement that keeps the stable, area-coded ID it
was given in a master specification (e.g. `KS-001`, `NFR-007`) rather than a
sequential `FR-<number>`. It extends [Requirement](requirement.md), so it is a
first-class node in the traceability chain — but at `status: draft` it is a
catalogued backlog item that draws no completeness findings. As a requirement is
scheduled into a phase it flips to `accepted` (committed), at which point the
linter expects it to be implemented and verified like any other requirement.

This is how IBuildOS dogfoods its own master spec: the spec is decomposed into one
CatalogRequirement per `AREA-NNN`, and each is driven through the chain as the
matching capability is built.
