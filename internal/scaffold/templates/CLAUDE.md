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
| Build | write one artifact correctly (any of the 24 types) | `/ibuild-author` |
| Implement | write code + tests for a Task/Story and close the chain | `/ibuild-implement` |
| Fix | file, reproduce, root-cause, and fix a bug | `/ibuild-bug` |
| Review | check traceability and find chain gaps | `/ibuild-audit` |
| Review | find semantic contradictions across linked artifacts | `/ibuild-contradict` |
| Monitor | see the traceability dashboard | `/ibuild-status` |
| Ship | validate-and-ship | `/ibuild-ship` |

The skills are vendored in `.claude/` (committed with this repo), so they work on
clone with no install. To also install them machine-wide: `/plugin marketplace add
PurnaOS/iBuildOS` then `/plugin install ibuildos`.

Fast knowledge (for you or an agent): `iBuild graph --node /work/task-0001.md`
returns a node and its neighborhood — the requirements analog of a code graph.

## The gate

`iBuild validate .` must exit 0 before shipping. The AI skills suggest and edit;
they never auto-commit and they never run inside the linter. A `Task` may be
`status: done` only once its `code` globs match real files, its `verified_by`
tests are `passing`, and it traces to a requirement (directly or via its parent).
