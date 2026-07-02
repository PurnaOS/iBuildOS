# iBuildOS

**Your whole software lifecycle, in the git repo — checkable.**

Requirements, plans, work, bugs, tests, decisions, and code all live together as
plain markdown files (with a bit of YAML on top), next to the code they describe.
A fast, offline linter (`iBuild`) keeps them honest: it checks that every
requirement is built and tested, that links point at real things, and that a
task isn't marked "done" until its code exists and its tests pass. AI agents help
you write it all; they never commit behind your back.

No database. No SaaS. No lock-in. Delete iBuildOS and you still have a usable pile
of markdown + code. One self-contained binary, built with [Bun](https://bun.sh).

---

## Install

```sh
git clone <this repo> && cd <repo>
bun install
bun run build          # → dist/iBuild
cp dist/iBuild /usr/local/bin/   # optional: put it on PATH
```
No build? Run from source: `bun src/cli.ts <command>`.

## Quick start

```sh
mkdir my-project && cd my-project
git init                 # iBuildOS is git-native
iBuild init --full       # scaffold the bundle (--full = whole taxonomy)
iBuild validate .        # exits 0 — you're set up
```

`init` creates:
- `.ibuildos.yaml` — config
- `docs/types/*.md` — the type profile (edit these to change your process)
- `docs/{requirements,work,tests,...}/` — where your artifacts live
- `.claude/` — AI skills that work in Claude Code with zero install

## The idea: a chain you can check

```
Requirement  →  Task  →  Code  →  Test
```

Write a requirement. Write a task that `implements` it. Point the task's `code` at
the files it produces and `verified_by` at a test. `iBuild validate` fails until
that chain is real. Example:

```markdown
---
type: FunctionalRequirement
id: FR-0001
title: Users can reset their password
owner: alice
status: accepted
---
The system shall let a user reset a forgotten password via an emailed link.
```
```markdown
---
type: Task
id: TASK-0001
title: Password-reset endpoint
owner: alice
status: done
code: [src/auth/reset.ts]
links:
  implements: [/requirements/fr-0001.md]
  verified_by: [/tests/test-reset.md]
---
```

Run `iBuild validate .` — it tells you, with exact file:line, anything missing.

## Everyday commands

| Command | Does |
|---|---|
| `iBuild validate .` | the gate — 0 errors to ship. `--changed` for pre-commit, `--base main` for a PR |
| `iBuild status .` | dashboard: how many requirements built / tested / traced |
| `iBuild matrix .` | requirements traceability matrix |
| `iBuild gaps .` | orphan code, untested requirements |
| `iBuild impact src/x.ts` | what a code change touches (tasks → requirements → tests) |
| `iBuild graph . --node /work/task-0001.md` | one artifact + its neighborhood (JSON) |
| `iBuild mine --as alice` | your owned + assigned work |
| `iBuild report --kind status` | a stakeholder status report (draft) |
| `iBuild site . --out portal.html` | a self-contained offline HTML portal |
| `iBuild serve .` | **interactive Studio app** → http://127.0.0.1:4321 |
| `iBuild instructions <Type>` | a fill-in template for any type you've defined |

Run `iBuild help` for the full list.

## The Studio (`iBuild serve`)

A local, single-user web app (localhost only) to *see and do* everything:

- **Dashboard** — coverage + health at a glance
- **Requirements** — grouped by area, collapsible; click any to read it
- **Plan** — a **kanban** board of your work, by status
- **Author** — guided forms that validate as you type
- **Review** — see your working-tree diff, *simulate* an edit's impact before you make it, discard
- **Operate** — run validate / tests / the unified gate from the UI
- **Agent** — ask a coding agent to make a change; it comes back as a reviewable diff, never a commit
- **Workspaces / My Work / People** — parallel-agent workspaces, your queue, team workload

Everything writes to your working tree and leaves committing to you.

## The workflow (with AI, in Claude Code)

| Stage | Skill |
|---|---|
| Capture an idea → Vision / PRD / requirements | `/ibuild-discover` |
| Break down into epics / stories / tasks | `/ibuild-plan` |
| Write one artifact correctly | `/ibuild-author` |
| Write the code + tests, close the chain | `/ibuild-implement` |
| File, reproduce, and fix a bug | `/ibuild-bug` |
| Find chain gaps / contradictions | `/ibuild-audit`, `/ibuild-contradict` |
| Evolve an existing system (spec-driven) | `/ibuild-explore` → `/ibuild-propose` → `/ibuild-apply` → `/ibuild-archive` |

Every skill is **suggest-only**: it edits files for you to review; you commit.

## Make it your own

The taxonomy is data, not code. Edit `docs/types/*.md` — add fields, add
relationships, invent new artifact types, rename statuses — and `iBuild validate`
follows with **zero code changes**. `iBuild instructions <Type>` prints the exact
authoring template for whatever you define.

## Gate it

- **Pre-commit:** `iBuild validate . --changed`
- **CI:** run `iBuild validate .` (exit 1 fails the build); `--format json` for machine output. Brownfield repo? `--baseline` gates only *new* violations, `--report-only` annotates without failing.

## License

See [LICENSE](LICENSE).
