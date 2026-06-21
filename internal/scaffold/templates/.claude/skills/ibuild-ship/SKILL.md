---
name: ibuild-ship
description: >
  The traceability gate before shipping: confirm `iBuild validate` is clean and
  the Requirement→Task→Code→Test chain is complete, surface anything blocking,
  then hand off to the project's normal PR/ship flow. Use when the user says
  "ship", "is this ready", "ready to merge", "ship the requirements", or "gate
  this". It validates and reports; it does not invent a git workflow.
---

# iBuild Ship

The last check before work leaves the branch: the deterministic gate must be green
and the chain whole.

## Procedure

1. **Run the gate.** `iBuild validate .` must exit 0. If it doesn't, stop and route
   the user to `/ibuild-audit` — do not ship a red bundle.
2. **Check chain completeness** with `/ibuild-status` (or `iBuild graph`): no
   `done` task missing code or a passing test, no active requirement
   unimplemented/untested. Warnings (e.g. a `proposed` requirement) are not
   blockers — call them out but don't gate on them.
3. **Optionally** suggest `/ibuild-contradict` for a semantic pass if the change
   touched requirement or task content.
4. **Hand off to the real ship flow.** If the project has a `/ship` skill or a
   documented PR process, use it. iBuildOS gates traceability; it does not replace
   your git/PR tooling. Do not push or open a PR unless the user asks.

## Boundaries

- Gate, don't bypass: never mark work shippable while `iBuild validate` is red.
- You do not `git commit`/`push`/open PRs on your own — confirm with the user and
  defer to their ship flow.
