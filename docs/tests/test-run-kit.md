---
type: Test
id: TEST-run-kit
title: The agent-team kit ships with init and mirrors without drift
owner: srini
status: passing
links:
  verifies: [/requirements/ag/ag-009.md]
---

`test/scaffold.test.ts` — `plugin/commands/` mirrors byte-identical to
`templates/.claude/commands/`, the embedded payload carries it, and
`iBuild init` materializes `.claude/commands/run-backlog.md`.
