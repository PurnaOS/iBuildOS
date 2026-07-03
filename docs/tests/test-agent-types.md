---
type: Test
id: TEST-agent-types
title: Agent and AgentRun types validate and wire into the graph
owner: srini
status: passing
links:
  verifies: [/requirements/ag/ag-010.md, /requirements/ag/ag-011.md]
---

`test/run.test.ts` (types section) — the dogfood roster in `docs/agents/`
validates; an `assignee` link to an Agent satisfies the Actor target
polymorphically; an ARUN record with `run_by`/`executes` links resolves in the
graph and draws no chain findings.
