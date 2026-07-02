---
type: ArtifactType
defines: Architecture
extends: WorkItem
description: An architecture description (C4/arc42 reference) stored in-repo and linkable.
fields:
  id:
    required: true
    pattern: "ARCH-<slug>"
    doc: Stable identifier, e.g. ARCH-system-context.
  status:
    required: true
    one_of: [draft, current, superseded]
    doc: Document lifecycle.
relationships:
  supersedes:
    target: Architecture
    max: 1
    doc: A prior architecture description this one replaces.
---

# Architecture

An **Architecture** artifact describes structure — a C4 level, an arc42 section,
or a text-based model that diagrams are generated from (a binary-only diagram is
never the source of truth). It lives in-repo and is linkable like any other
artifact.
