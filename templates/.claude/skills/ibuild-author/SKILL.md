---
name: ibuild-author
description: >
  Author or update a single OKF-SDLC artifact — requirement, epic, story, task,
  subtask, test, bug, spike, release, sprint, or any of the project's types —
  with correct frontmatter and typed links. Reads the type definition from
  docs/types/*.md at runtime, so required fields, id patterns, and relationships
  are never hardcoded and never drift. Use when the user says "write a
  requirement", "add an FR", "create a story/task/test", "new artifact", or names
  any artifact type. Always finishes by running `iBuild validate`.
---

# iBuild Author

Write exactly one conformant artifact. The type system is data, not code: the
linter loads `docs/types/*.md` and so do you. Never invent frontmatter.

## Procedure

1. **Locate the bundle.** Read `.ibuildos.yaml` → `root` (default `docs`),
   `types` (default `types`), `artifacts` globs, `code_field`. Use these paths;
   do not assume `docs/`.
2. **Pick the type.** Map the request to a type (Task, FunctionalRequirement, …).
   Read `<root>/<types>/<kebab-type>.md`. Follow its `extends:` and read the
   parent too (Task extends BacklogItem extends WorkItem; FR extends Requirement).
   Abstract types may not be used directly — pick a concrete subtype.
3. **Honor the dialect.** From the resolved type:
   - `fields:` — supply every `required` field. Respect `one_of` (closed set),
     `pattern` (e.g. `TASK-<number>`), and `type` (`list` → a YAML list).
   - `relationships:` — these are the keys allowed under `links:`. Respect
     `target` (the type each link must point to, or a subtype) and `min`/`max`
     (e.g. `parent` is `max: 1`).
4. **Allocate the id.** Scan existing files in the target `artifacts:` glob, find
   the highest id matching the `pattern`, increment, and zero-pad to match
   siblings.
5. **Write the file** under the correct glob (`requirements/**`, `work/**`,
   `tests/**`). Frontmatter: `type`, `id`, the required fields, then a `links:`
   block keyed by relationship name with root-relative paths in lists:
   ```yaml
   links:
     implements:  [/requirements/fr-0007.md]
     parent:      [/work/story-0001.md]
     verified_by: [/tests/test-orders.md]
   ```
6. **Validate.** Run `iBuild validate .` from the repo root (no path arg — the
   linter prefixes `root` itself). If `summary.errors > 0`, read each finding's
   `file`/`rule`/`message`, fix, and re-run. Done only at zero errors.

## Verify a link before you write it

`iBuild graph --node <target-ref>` confirms a target exists and shows its type, so
you wire `implements`/`verified_by`/`parent` to the right document.

## Boundaries

- One artifact per invocation. For a whole breakdown, use `/ibuild-plan`.
- If the user asks for a type the profile does not define (e.g. an ADR when no ADR
  type exists), either add an `ArtifactType` to `docs/types/` first, or write a
  plain doc OUTSIDE the `artifacts:` globs — never emit frontmatter the dialect
  cannot express just to fake it.
- You write files; you do not `git add`/`commit`/`push`.
- The linter is the authority. If it disagrees with you, it is right.
