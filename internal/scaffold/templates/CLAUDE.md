# CLAUDE.md

This project uses **iBuildOS** — a Git-native SDLC layer on OKF. The whole
lifecycle (requirements, work breakdown, tests, releases) lives under `docs/` as
OKF artifacts: markdown files with YAML frontmatter and typed links, validated by
the deterministic `iBuild` linter. **Git is the source of truth** — there is no
external tracker, and no hidden state.

## Develop with iBuildOS

Full walkthrough: `docs/develop-with-ibuildos.md`. The lifecycle and the skill for
each stage:

| Stage | Want to… | Skill |
|---|---|---|
| Discover | capture an idea as Vision → PRD → BusinessRequirement | `/ibuild-discover` |
| Plan | refine into FR/NFR and break down Initiative→Epic→Story→Task | `/ibuild-plan` |
| Build | write one artifact correctly (any of the project's types) | `/ibuild-author` |
| Implement | write code + tests for a Task/Story and close the chain | `/ibuild-implement` |
| Fix | file, reproduce, root-cause, and fix a bug | `/ibuild-bug` |
| Review | check traceability and find chain gaps | `/ibuild-audit` |
| Review | find semantic contradictions across linked artifacts | `/ibuild-contradict` |
| Monitor | see the traceability dashboard | `/ibuild-status` |
| Ship | validate-and-ship | `/ibuild-ship` |

**Changing an existing system?** (Needs the full profile — `iBuild init --full`, or
add `change.md`/`scenario.md` to `docs/types/`.) Capture it as a `Change` and run the
overlay: `/ibuild-explore` (map the blast radius) → `/ibuild-propose` (author the
Change + the requirements it affects) → `/ibuild-apply` (break down + implement) →
`/ibuild-archive` (gate clean → `status: archived`). A Change is a graph node, not a
folder; git stays the source of truth. Use `Scenario` artifacts for GIVEN/WHEN/THEN
acceptance criteria in RFC 2119 language.

The skills are vendored in `.claude/` (committed with this repo), so they work on
clone with no install. To also install them machine-wide: `/plugin marketplace add
PurnaOS/iBuildOS` then `/plugin install ibuildos`.

Fast knowledge (for you or an agent): `iBuild graph --node /work/task-0001.md`
returns a node and its neighborhood; `iBuild instructions <Type>` prints the exact
authoring template for a type (from `docs/types/`).

## The gate

`iBuild validate .` must exit 0 before shipping. The AI skills suggest and edit;
they never auto-commit and they never run inside the linter. A `Task` may be
`status: done` only once its `code` globs match real files, its `verified_by`
tests are `passing`, and it traces to a requirement (directly or via its parent).
