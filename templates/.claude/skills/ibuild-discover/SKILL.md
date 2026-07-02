---
name: ibuild-discover
description: >
  Turn a raw idea into the top of the OKF-SDLC chain: a Vision, a PRD, and one or
  more BusinessRequirement artifacts, correctly linked. This is the "why" before
  any work breakdown. Use when the user says "I have an idea", "capture this
  product", "write the vision/PRD", "what are the requirements", or is starting a
  new initiative and needs the problem framed as artifacts. Hands off to
  /ibuild-plan for the work breakdown.
---

# iBuild Discover

Capture intent at the top of the chain. Interview lightly, then write artifacts —
do not over-produce. Each file conforms to its type definition in `docs/types/`.

## Procedure

1. **Locate the bundle** (read `.ibuildos.yaml`). If there is no bundle yet, run
   `/ibuild-init` first.
2. **Understand the idea.** Ask only what you need: the problem, who has it, and
   what success looks like. Keep it to a few questions.
3. **Write top-of-chain artifacts**, each via the same dialect discipline as
   `/ibuild-author` (read the type def, supply required fields, valid id, links):
   - one **Vision** — the long-term "why".
   - one **PRD** — the product definition, linked to the Vision.
   - one or more **BusinessRequirement** — the concrete needs, linked to the PRD
     (use the relationship the PRD/requirement types declare, e.g. `traces_to`).
   Only create what the idea justifies — a small idea may be a single BR.
4. **Validate.** Run `iBuild validate .`; fix findings; reach zero errors.
5. **Hand off.** Suggest `/ibuild-plan` to refine these into FR/NFR and break the
   work down.

## Boundaries

- Don't fabricate scope. If the user hasn't decided something, leave it out or ask
  — an empty-but-honest bundle beats a confident-but-wrong one.
- Suggest-only on anything ambiguous; you write artifacts, you don't commit.
- Defer to `iBuild validate`.
