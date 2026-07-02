---
type: ArtifactType
defines: RequirementsSpecification
description: A master requirements specification document — the scope-complete catalog, later decomposed into individual Requirements.
fields:
  title:
    required: true
    doc: Document title.
  description:
    doc: One-paragraph summary.
  status:
    one_of: [draft, in_review, approved, superseded]
    doc: Document lifecycle.
  version:
    doc: Semantic version of the specification.
  date:
    type: date
    doc: Last-edited date.
  owner:
    doc: Accountable author.
  tags:
    type: list
    doc: Free-form tags.
---

# RequirementsSpecification

A **RequirementsSpecification** is a whole-catalog requirements document. It is a
knowledge artifact (not a work item): it carries no `id` and draws no chain
findings. The authoritative, per-requirement artifacts are produced by
*decomposing* it into individual [Requirement](requirement.md) documents; this
type lets the master document itself live in the repo as a validatable artifact
in the meantime.
