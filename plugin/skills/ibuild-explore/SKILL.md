---
name: ibuild-explore
description: >
  A no-stakes thinking partner before any change is proposed: read the existing
  graph, weigh options, and map the blast radius of an idea — which requirements
  it would ADD, MODIFY, or REMOVE, and which work it would touch. Use when the
  user says "explore", "what would it take to…", "I'm thinking about changing…",
  "what does this affect", or is sizing up an evolution before committing. Writes
  nothing — it ends by recommending /ibuild-propose with a concrete change shape.
---

# iBuild Explore

The cheap, reversible step before a Change exists. You investigate and shape a
direction; you do not author artifacts. The deliverable is a clear-eyed proposal
the user can accept into `/ibuild-propose`.

## Procedure

1. **Locate the bundle** (read `.ibuildos.yaml` → `root`, `types`, `artifacts`,
   chain relationship names). Never assume `docs/` or hardcode a type name.
2. **Understand the intent.** Ask only what you need to size the change.
3. **Map the blast radius from the graph, not from guessing.** Run
   `iBuild graph . --format json`; for a specific artifact use
   `iBuild graph --node <ref> --depth 1`. Identify:
   - which existing **Requirements** the idea would **MODIFY** or **REMOVE**
     (and the work `implements`-linked to them that would move with them),
   - what new behaviour would need to be **ADDED** as new requirements,
   - the Tasks/Stories/Tests already in the neighborhood.
4. **Weigh options.** Sketch one or two ways to do it, with trade-offs. Name the
   smallest version that delivers value.
5. **Recommend a change shape** — the scope (`added`/`modified`/`removed`/`mixed`),
   the requirements it `affects`, and a rough task list — and hand off to
   `/ibuild-propose` to capture it. Note that `iBuild instructions Change` gives
   the exact fields when the user is ready.

## Boundaries

- Read-only. No artifacts, no edits, no commits — exploring is free precisely
  because nothing is written.
- Derive impact from `iBuild graph`; if you can't see it in the graph, say so.
- One idea per pass. Capture happens in `/ibuild-propose`, breakdown in
  `/ibuild-plan`.
