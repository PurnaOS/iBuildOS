---
type: Test
id: TEST-okf
title: okf frontmatter + glob behave as specified
owner: srini
status: passing
links:
  verifies: [/requirements/fr-0001.md]
---

`test/okf.test.ts` — split/parse/line-number/BOM/CRLF/links/duplicate-key cases
plus glob `**` matching and case-exact `pathCaseMatches`.
