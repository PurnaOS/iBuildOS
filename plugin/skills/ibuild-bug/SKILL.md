---
name: ibuild-bug
description: >
  The bug workflow: capture a defect as a Bug artifact, reproduce it with a
  failing regression test, find the root cause, fix it, then prove the fix —
  wire the Bug's `affects` (the Requirement it violates) and `verified_by` (the
  regression Test) and move it to `status: resolved`, but only once the test that
  failed now passes. Use when the user says "file a bug", "fix this bug", "log a
  defect", "this is broken", "regression", or names a BUG-id. Always finishes
  with `iBuild validate`. Suggest-only: it never commits.
---

# iBuild Bug

A defect is a violation of expected behaviour, so it lives in the same
traceability graph as the feature it broke. This workflow keeps it there: a Bug
artifact `affects` the Requirement it violates and is `verified_by` a regression
Test that fails before the fix and passes after. The linter is the authority — a
`resolved` Bug should carry a `passing` regression test, or the graph is lying.

Iron law: **no fix without a reproduction.** A bug you cannot reproduce is a bug
you cannot prove you fixed.

## Procedure

1. **Locate the bundle.** Read `.ibuildos.yaml` → `root`, `types`, `artifacts`
   globs, and the chain relationship names. Use these — never assume `docs/` or
   hardcode a type name.
2. **Capture the Bug.** Author a Bug artifact via the `/ibuild-author` dialect
   discipline: id `BUG-<number>` (scan existing, increment), `status: open`,
   `severity`, a body stating observed vs. expected behaviour and repro steps.
   Link `affects` to the Requirement whose behaviour is violated (use
   `iBuild graph --node <ref>` to find it); `parent` to an Epic if it groups one.
   If no requirement covers the broken behaviour, say so — the "bug" may be a
   missing requirement; route to `/ibuild-discover` / `/ibuild-plan`.
3. **Reproduce.** Write a regression test that demonstrates the defect and **run
   it** — confirm it FAILS, and fails for the right reason. No red test, no
   confirmed bug.
4. **Find the root cause.** Investigate until you can name the actual cause — not
   a symptom. Do not patch around it. Set `status: in_progress`.
5. **Fix.** Make the minimal code change that addresses the root cause, matching
   surrounding style. Keep the diff scoped to this defect.
6. **Prove it.** Re-run the regression test — it must now PASS — then run the full
   test command (e.g. `go test ./...`, `npm test`) to confirm no new breakage.
7. **Record the Test artifact.** Ensure a regression Test artifact exists (author
   one if missing) and set its status to `passing` ONLY because you watched it go
   green. Never set `passing` on faith.
8. **Wire the proof.** On the Bug: add `verified_by` → the regression Test, confirm
   `affects` is intact, set `status: resolved` (`wont_fix`/`closed` only when the
   user decides not to fix).
9. **Validate.** Run `iBuild validate .` from the repo root; fix every finding;
   done only at zero errors.
10. **Hand off.** Suggest `/ibuild-status` for coverage and `/ibuild-ship` for the
    pre-merge gate. Do not commit or open a PR.

## The honesty rule

`status: resolved` claims the defect is gone and proven. The proof is the
regression test that failed in step 3 and passes in step 6. If you never saw it
go red then green, the bug is not resolved — leave it `in_progress` and say why.

## Boundaries

- Bug has no `code` field — the proof is the regression `verified_by` Test, not
  `code` globs. Do not invent frontmatter the Bug type does not define.
- One defect per invocation. To implement a planned Task, use `/ibuild-implement`;
  to write any single artifact's frontmatter, use `/ibuild-author`.
- Never flip `status: resolved` while `iBuild validate` is red or the regression
  test has not passed in this session.
- You write code and artifacts; you do not `git add`/`commit`/`push`. Defer to the
  user's ship flow.
- The linter is deterministic and AI-free. This skill orchestrates it; it does not
  replace it.
