---
name: ibuild-contradict
description: >
  Find SEMANTIC contradictions across linked OKF-SDLC artifacts that the
  deterministic linter cannot see — a Task whose body contradicts the requirement
  it implements, two NonFunctionalRequirements in conflict, a Test asserting
  behavior a Story forbids. Use when the user says "check for contradictions", "do
  these conflict", "semantic review", "do the tasks match their requirements", or
  "review the content for consistency". AI, suggest-only: it reports hypotheses
  for human review and never rewrites anything.
---

# iBuild Contradict

Catch conflicts in *meaning* across the typed graph — the layer the structural
linter can't reach. This is AI reasoning over content, so every finding is a
confidence-tagged hypothesis, never a verdict.

## Procedure

1. **Delegate to the checker subagent.** Launch the `ibuild-contradiction-checker`
   agent. It reads the link graph (`iBuild graph --body full`) and the bodies of
   linked artifact pairs, then reports possible contradictions.
2. **Present the report** to the user: each conflict names the two artifacts, the
   relationship between them, the clashing claims (quoted), and a suggestion or a
   "needs human ruling".
3. **Resolve with the user.** A contradiction is a judgment call. If the user
   decides which side changes, route the edit through `/ibuild-author` and re-run
   `iBuild validate .`. Never pick a winner yourself.

## Boundaries

- Suggest-only. The checker never edits a file, resolves a conflict, or commits —
  an AI silently rewriting the source of truth is the failure mode this design
  exists to avoid.
- Findings are "possible", not "definite". Tag confidence and let the human rule.
- This is orthogonal to `/ibuild-audit`: that finds structural gaps, this finds
  semantic conflicts. Run both for a full review.
