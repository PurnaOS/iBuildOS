---
name: ibuild-archive
description: >
  Close a delivered Change: confirm the gate is clean and every delivers-Task is
  done, move the Change to status:archived, and (suggest-only) move the file into
  the changes/archive/ folder for the audit trail. Use when the user says "archive
  this change", "close CHANGE-…", "the change is done", or "wrap up the proposal".
  Reuses the /ibuild-ship gate. It validates and proposes the move; it never
  commits.
---

# iBuild Archive

The capstone of the change lifecycle. Archiving records that a Change shipped —
without merging anything into your source of truth (the requirements were already
edited in place by a human during apply) and without reimplementing `git log`.
The audit trail is git history plus the preserved Change file.

## Procedure

1. **Locate the bundle and the Change.** Read `.ibuildos.yaml`; load it with
   `iBuild graph --node <change-ref> --depth 1`.
2. **Check it's actually done — from the graph, not on faith:**
   - every `delivers` Task is `status: done`,
   - the requirements it `affects` are at their final status
     (ADDED → `accepted`/`implemented`; REMOVED → `deprecated`).
   If any aren't, stop and route back to `/ibuild-apply`; list what's open.
3. **Run the gate.** `iBuild validate .` must exit 0 (this is the `/ibuild-ship`
   gate). Optionally suggest `/ibuild-contradict` for a semantic sanity pass.
4. **Archive.** Set the Change `status: archived`. Then **suggest** moving the file
   for tidiness — e.g. `git mv docs/changes/CHANGE-<slug>.md docs/changes/archive/CHANGE-<slug>.md`
   (the archive folder is still under the changes glob, so it stays validated).
   Do not run the move yourself unless the user asks; it's their git history.
5. **Confirm** validate is still clean after the move, and report what shipped.

## Boundaries

- No merge engine, no delta-into-canonical rewrite — the tool never edits your
  source of truth. A human did the requirement edits during apply.
- Suggest the `git mv`; don't `git add`/`commit`/`push`. Defer to the user's ship
  flow.
- Only archive a Change whose work is genuinely done and whose gate is green.
