---
type: ArtifactType
defines: Change
extends: WorkItem
description: A proposal to evolve the system — the why, the what, and the work that delivers it.
fields:
  id:
    required: true
    pattern: "CHANGE-<slug>"
    doc: Stable identifier, e.g. CHANGE-orders-freshness-sla.
  status:
    required: true
    one_of: [proposed, active, done, archived]
    doc: Lifecycle — proposed (drafted), active (approved, in progress), done (delivered), archived (history).
  scope:
    one_of: [added, modified, removed, mixed]
    doc: Net effect on requirements — the OpenSpec-style ADDED/MODIFIED/REMOVED delta, at a glance.
relationships:
  affects:
    target: Requirement
    doc: Requirement(s) this change adds, modifies, or removes — the delta link.
  delivers:
    target: Task
    doc: Task(s) that carry out the change — the checklist as real, traceable graph nodes.
  supersedes:
    target: Change
    max: 1
    doc: A prior change this one replaces (the rework audit chain).
---

# Change

A **Change** is the unit of *evolution* — what spec-driven tools call a change
proposal. One file captures the **why** (a `## Why` body section), the
**what / scope** (`## What changes`), and the **technical approach** (`## Design`).
The work itself is `delivers` links to real [Task](task.md)s — not opaque
checkboxes, so each carries its own `code` + `verified_by` traceability.

It `affects` the [Requirement](requirement.md)s it touches. iBuildOS expresses
the delta through mechanics it already has, not a new section dialect:

- **ADDED** — author a new requirement at `status: proposed`, link it under `affects`.
- **MODIFIED** — edit the requirement in place (git is the diff/audit trail); for a
  material rewrite, author a replacement and set the old one `status: deprecated`.
- **REMOVED** — flip the target requirement to `status: deprecated`. Nothing is
  deleted; deprecated requirements stop drawing chain findings.

The lifecycle is the `status` enum: `proposed` → `active` → `done` → `archived`.
A Change draws no chain-completeness findings — it is neither a requirement nor
task-like — so it adds capture without adding gates. Git stays the source of
truth; the Change is the reviewable, linkable record of intent that a raw diff
isn't.
