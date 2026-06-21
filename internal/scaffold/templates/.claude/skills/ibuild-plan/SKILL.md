---
name: ibuild-plan
description: >
  Refine requirements and break work down: turn BusinessRequirements into
  Functional/NonFunctional requirements, then decompose
  Initiative→Epic→Story→Task→Subtask with parent and implements links, and plan
  cadence with Release/Sprint/Milestone. Use when the user says "break this
  down", "plan the epic", "split into stories/tasks", "create the backlog",
  "plan a release/sprint", or "what work does this need". Builds the middle of the
  chain so /ibuild-author and /ibuild-audit have something to trace.
---

# iBuild Plan

Decompose work into linked OKF-SDLC artifacts so the chain is traceable end to
end. Produce several artifacts in one pass, each conforming to its type def.

## Procedure

1. **Locate the bundle and the starting point.** Read `.ibuildos.yaml`. Identify
   the requirement(s) or initiative the user is planning from. `iBuild graph
   --node <ref>` shows what already links to it so you don't duplicate work.
2. **Refine requirements.** From each BusinessRequirement, derive
   **FunctionalRequirement** and **NonFunctionalRequirement** artifacts, linked
   back (e.g. `derives_from`/`traces_to` as the types declare).
3. **Break down the work**, climbing the hierarchy the types define:
   - **Initiative → Epic → Story → Task → Subtask**, each new artifact's `parent`
     pointing one level up (`parent` is `max: 1`).
   - Work that fulfills a requirement gets an `implements` link to it (directly,
     or the Story implements it and the Tasks roll up via `parent`).
   - **Bug** / **Spike** sit as peers of Story under an Epic.
4. **Plan cadence (optional).** Link backlog items to a **Release**
   (`planned_for`) and a **Sprint** (`scheduled_in`); a **Milestone** may
   `require` work; a **Roadmap** may `include` initiatives.
5. **Honor the dialect** for every file (required fields, id `pattern`, link
   `target`/`min`/`max`), exactly as `/ibuild-author` does. When writing many
   files, keep ids consistent and sequential.
6. **Validate.** Run `iBuild validate .`; fix findings; reach zero errors. A
   `proposed` requirement with nothing implementing it is a *warning*, not an
   error — fine while planning.

## Keep it honest

- Decompose only as far as the user actually wants. Don't invent tasks to fill a
  template — a thin, true breakdown beats a thick, speculative one.
- Wire links as you go; a broken graph that "looks complete" is worse than an
  honestly-partial one. `iBuild validate` will tell you which links dangle.

## Boundaries

- You write artifacts; you do not commit.
- The completeness rules (`iBuild validate`) are the authority on whether the
  chain is whole.
