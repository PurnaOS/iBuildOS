---
name: ibuild-propose
description: >
  Capture a proposed evolution as a Change artifact — the why, the what/scope, and
  the requirements it affects — at status:proposed, plus any new requirements it
  ADDS (at status:proposed). This is the spec-driven "agree before you build" step.
  Use when the user says "propose a change", "write this up", "draft a proposal",
  "let's plan this change", or accepts an idea from /ibuild-explore. Always finishes
  with `iBuild validate`. Suggest-only: it never commits.
---

# iBuild Propose

A Change is the unit of evolution — one artifact that captures intent so humans
and AI agree on the plan before code. The Change is a graph node, not a folder:
git stays the source of truth; the Change makes the *requirement delta* reviewable
and linkable in a way a raw diff isn't.

## Procedure

1. **Locate the bundle** (read `.ibuildos.yaml`). Confirm a `Change` type exists
   (`iBuild instructions Change`); if not, the profile predates this overlay —
   tell the user.
2. **Get the exact fields.** Run `iBuild instructions Change` for the required
   frontmatter, id pattern (`CHANGE-<slug>`), the `status`/`scope` enums, and the
   `affects`/`delivers`/`supersedes` links. Never hardcode field knowledge.
3. **Author the Change** under the changes glob (e.g. `docs/changes/CHANGE-<slug>.md`),
   `status: proposed`, with a body that captures:
   - `## Why` — the problem and the user need,
   - `## What changes` — scope in/out; set the `scope` field
     (`added`/`modified`/`removed`/`mixed`),
   - `## Design` — the technical approach and key decisions.
4. **Wire the delta** with `affects` links, expressing each kind the iBuildOS way:
   - **ADDED** — author the new requirement(s) at `status: proposed` (via the
     `/ibuild-author` dialect discipline) and link them under `affects`.
   - **MODIFIED / REMOVED** — link the existing requirement(s) under `affects`;
     leave them as-is for now (status changes happen in `/ibuild-apply`).
   Use `iBuild graph --node <ref>` to find the requirements involved.
5. **Validate.** Run `iBuild validate .`; fix findings; reach zero errors. A
   proposed requirement with no implementer is a warning, not an error — expected
   at this stage.
6. **Hand off.** Suggest `/ibuild-apply` to break the change down and build it.

## Boundaries

- Don't break work down here — that's `/ibuild-apply` → `/ibuild-plan`. Propose
  captures intent and the requirement delta only.
- A Change draws no chain-completeness findings; it's capture, not a gate. Don't
  invent frontmatter the type doesn't define.
- Suggest-only. You author artifacts; you don't `git commit`.
