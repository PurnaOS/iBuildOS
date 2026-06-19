---
type: Story
id: STORY-0001
title: Ship the MVP traceability linter and dogfood it on this repo
owner: srini
status: in_progress
priority: must
as_a: solo OSS maintainer
i_want: a traceability linter for my spec-driven repo
so_that: my requirements, tasks, code, and tests stay provably linked in CI
links:
  persona: [/work/persona-maintainer.md]
  implements: [/requirements/br-0001.md]
---

The Phase 1 vertical slice: build `iBuild`, validate the Requirement→Task→Code→Test
chain, ship a GitHub Action, and prove it by making `iBuild validate .` exit 0 on
this very repo.
