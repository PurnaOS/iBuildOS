---
type: Test
id: TEST-run-cmd
title: iBuild run selects, executes, gates, records, and commits deterministically
owner: srini
status: passing
links:
  verifies: [/requirements/ag/ag-012.md, /requirements/ag/ag-011.md]
---

`test/run.test.ts` — ready-selection matrix (statuses × requirement states ×
via-parent × priorities) in exact order; fake-runner loop produces one commit
per task, an ARUN record with `executes` link, and validate stays at 0;
failure paths (stop leaves the tree for the human; skip flips the task
blocked and continues); timeout kill; a real shell-fixture harness proves argv
substitution end to end; golden ARUN doc and dry-run JSON.
