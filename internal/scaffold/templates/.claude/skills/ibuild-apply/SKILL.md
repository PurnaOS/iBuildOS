---
name: ibuild-apply
description: >
  Carry out a proposed Change: move it to status:active, break it into Tasks
  (delivers links), implement them, and settle the requirement delta — accepting
  ADDED requirements and deprecating REMOVED/superseded ones. Use when the user
  says "apply this change", "start the change", "build CHANGE-…", "do the work for
  this proposal", or names a CHANGE-id to execute. Composes /ibuild-plan and
  /ibuild-implement. Always finishes with `iBuild validate`. Suggest-only: it never
  commits.
---

# iBuild Apply

Apply turns an agreed proposal into delivered work. It doesn't reinvent planning
or implementation — it drives the existing skills and keeps the Change's status
and its requirement delta honest.

## Procedure

1. **Locate the bundle and the Change.** Read `.ibuildos.yaml`; load the Change
   with `iBuild graph --node <change-ref> --depth 1`. Confirm it's `proposed` or
   `active`.
2. **Activate.** Set the Change `status: active`.
3. **Break it down.** For the work the Change needs, use `/ibuild-plan` to create
   Stories/Tasks, then link them to the Change under `delivers` (and to the
   requirements they `implements`). The task list lives as real graph nodes, not
   checkboxes.
4. **Implement.** For each Task, use `/ibuild-implement` — write code + tests, run
   the suite, wire `code`/`verified_by`, flip the Task `done` only when tests pass.
5. **Settle the delta** as the work lands:
   - **ADDED** requirements → move to `accepted`/`implemented` as their chain
     completes (an active requirement must be implemented and verified — the linter
     enforces this).
   - **MODIFIED** requirements → edit in place; git is the diff and audit trail.
   - **REMOVED** / replaced requirements → set `status: deprecated` (deprecated
     requirements stop drawing chain findings); if a new requirement supersedes an
     old one, wire that relationship if the profile defines it.
6. **Re-validate after each meaningful step.** Run `iBuild validate .`; keep it at
   zero errors before moving on.
7. **Hand off.** When every `delivers` Task is `done` and validate is clean,
   suggest `/ibuild-archive` to close the Change, or `/ibuild-status` to see how
   much is left.

## Boundaries

- Compose, don't duplicate: planning is `/ibuild-plan`, coding is
  `/ibuild-implement`. Apply orchestrates and keeps the Change coherent.
- Never flip a Task `done` while its tests fail or `iBuild validate` is red.
- Suggest-only. You edit artifacts and code; you don't commit or open a PR.
