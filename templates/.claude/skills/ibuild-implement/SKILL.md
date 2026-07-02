---
name: ibuild-implement
description: >
  Implement a Task (or every Task under a Story/Epic): write the real application
  code and tests, run the project's test command, then wire the Task's `code`
  globs and `verified_by` link and flip it to `status: done` — but only once the
  code exists and the tests actually pass. Closes the Requirement→Task→Code→Test
  chain that /ibuild-plan and /ibuild-author opened. Use when the user says
  "implement TASK-0007", "build this story", "do the work for this epic", "write
  the code for this task", or "make this task done". Always finishes with
  `iBuild validate`. Suggest-only: it never commits.
---

# iBuild Implement

Turn a planned Task into shipped, proven work. iBuildOS plans and proves
traceability; it does not generate your app code — that is normal coding. This
skill couples the two: write the code, run the tests, then make the artifact tell
the truth. The linter is the authority — a `done` Task must have `code` globs that
match real files and a `verified_by` test that is `passing`, or `iBuild validate`
goes red.

## Procedure

1. **Locate the bundle.** Read `.ibuildos.yaml` → `root`, `types`, `artifacts`
   globs, and the chain field/relationship names (`code_field`, `implements`,
   `verified_by`, `parent`). Use these — never assume `docs/` or hardcode a type
   name.
2. **Resolve the target.** `iBuild graph --node <ref> --depth 1` shows the
   artifact, its type, and what it links to.
   - A **leaf work item** (a Task/Subtask — concrete, no children): implement it.
   - A **container** (a Story/Epic with `parent` children): list its children and
     implement each leaf Task in dependency order. Confirm the set with the user
     before a large batch.
3. **Understand the intent.** Read the Task body, the requirement it `implements`
   (directly or via its parent), and the parent Story for acceptance criteria.
   Do not invent scope the chain does not justify — ask if unclear.
4. **Write the code.** Implement the change as ordinary code in the repo, matching
   the surrounding style. Keep the diff scoped to this Task.
5. **Write and run the test.** Add or extend the real test that exercises the
   change, then **run the project's test command** (e.g. `go test ./...`, `npm
   test`). The test must actually pass. If it fails, fix the code — do not proceed.
6. **Record the Test artifact.** Ensure a Test artifact exists for this work
   (author one via the `/ibuild-author` dialect discipline if missing) and set its
   status to `passing` ONLY because you watched the suite go green. Never set
   `passing` on faith.
7. **Wire the proof on the Task.** Set the `code` field to glob(s) that match the
   files you wrote, add the `verified_by` link to the Test artifact, confirm the
   `implements`/`parent` trace is intact, and set `status: done`.
8. **Validate.** Run `iBuild validate .` from the repo root. If
   `summary.errors > 0`, read each finding (`file`/`rule`/`message`) and fix —
   usually a `code` glob that matches nothing, a test that is not `passing`, or a
   missing requirement trace. Done only at zero errors.
9. **Hand off.** Suggest `/ibuild-status` for coverage and `/ibuild-ship` for the
   pre-merge gate. Do not commit or open a PR.

## The honesty rule

`status: done` is a claim that the work is real and verified. The gate checks the
`code` globs match files and the test is `passing`, but it trusts *you* that the
suite truly ran green. Run it. A Task that compiles but whose test you never
executed is not done — leave it `in_progress` and say so.

## Boundaries

- Implement only what the target Task scopes. For more work, plan it first with
  `/ibuild-plan`; for a single artifact's frontmatter, use `/ibuild-author`.
- Never flip `status: done` while `iBuild validate` is red or the test command
  has not passed in this session.
- You write code and artifacts; you do not `git add`/`commit`/`push`. Defer to the
  user's ship flow.
- The linter is deterministic and AI-free. This skill orchestrates it; it does not
  replace it.
