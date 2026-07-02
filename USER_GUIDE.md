# iBuildOS — User Guide

iBuildOS puts your whole software lifecycle **in the git repo** as plain markdown
(with YAML frontmatter) and keeps it honest with a fast, offline linter (`iBuild`).
AI agents help you author it through repo-local **skills**; they only ever
*suggest* — you review and commit.

This guide covers: installing, using it in a **new repo**, adopting it in an
**existing repo**, and every **skill** the framework installs.

---

## 1. Install

```sh
bun install && bun run build     # → dist/iBuild
cp dist/iBuild /usr/local/bin/   # optional: put `iBuild` on PATH
```
(Or run from source: `bun src/cli.ts <command>`.) You need `git`. For the AI
skills you need a coding harness — **Claude Code** is the reference; Codex/OpenCode
read the generated `AGENTS.md`.

---

## 2. What `init` puts in your repo

`iBuild init` scaffolds:

| Path | What it is |
|---|---|
| `.ibuildos.yaml` | config: bundle root, artifact globs, chain names, tooling, profile |
| `docs/types/*.md` | the **type profile** — every artifact kind, as data you can edit |
| `docs/{requirements,work,tests,changes,scenarios}/` | where your artifacts live |
| `CLAUDE.md`, `docs/develop-with-ibuildos.md` | agent + human guidance |
| `AGENTS.md` | the harness-agnostic contract (any coding agent can drive iBuild) |
| **`.claude/`** | **15 vendored skills + 2 subagents + a validate-on-edit hook** |

The `.claude/` folder is committed, so a fresh clone has the skills with **zero
install**. To also install them machine-wide: add this repo as a Claude Code
plugin marketplace.

---

## 3. Using it in a **new** repo (greenfield)

```sh
mkdir my-app && cd my-app
git init
iBuild init --full          # --full = whole taxonomy; drop it for the lean core profile
iBuild validate .           # exits 0 — set up
```

Then, in Claude Code, walk the lifecycle with skills (see §5):

1. **`/ibuild-discover`** — turn your idea into a Vision → PRD → BusinessRequirements.
2. **`/ibuild-plan`** — refine those into Functional/Non-functional requirements and
   break work down into Initiative → Epic → Story → Task.
3. **`/ibuild-implement`** — write the real code + tests for a task, then wire its
   `code` globs + `verified_by` test and flip it to `done`.
4. **`/ibuild-status`** — see where you are; **`/ibuild-ship`** — gate before merge.

At any point `iBuild validate .` is the source of truth: 0 errors = the chain is
complete. Open the Studio (`iBuild serve .`) to browse it all visually.

---

## 4. Using it in an **existing** repo (brownfield)

You don't have to convert everything at once. iBuildOS is built to adopt
incrementally.

**Step 1 — init without disturbing your code.**
```sh
iBuild init            # adds .ibuildos.yaml + docs/ + .claude/; never overwrites your files
```

**Step 2 — scope to a subset first (optional).** Edit `.ibuildos.yaml` `artifacts`
globs to cover only the area you're adopting; expand later.

**Step 3 — backfill traceability with an agent.** In Claude Code, use
**`/ibuild-discover`** and **`/ibuild-plan`** to describe the system you already
have, and **`/ibuild-author`** to write requirement/test artifacts that point at
existing code. (You review every suggested file before committing.)

**Step 4 — adopt the gate without blocking work.** On a repo with pre-existing
gaps, don't fail the build on day one:
```sh
iBuild baseline .                 # record current findings as accepted debt (.ibuildos-baseline.json, committed)
iBuild validate . --baseline      # now only NEW violations fail; the baseline can only shrink
iBuild validate . --report-only   # or: annotate in CI without failing at all
iBuild validate . --changed       # or: gate only files changed vs HEAD
iBuild validate . --base main     # or: gate only what a PR/stack changed vs main
```
As you pay down debt, regenerate the baseline (it shrinks) until you can drop
`--baseline` and gate cleanly.

**Step 5 — expand.** Widen the `artifacts` globs, add more requirements/tests, and
watch coverage climb with `iBuild status .` and `iBuild gaps .`.

---

## 5. The skills (what iBuildOS adds to your repo)

Skills live in `.claude/`. In Claude Code, type `/<name>` or just describe the task
in plain language — Claude picks the matching skill. **Every skill is
suggest-only:** it reads the repo, proposes edits/artifacts, and finishes by running
`iBuild validate`. It never `git commit`s — you review and commit.

### Setup
- **`/ibuild-init`** — set the project up as an iBuildOS bundle (runs `iBuild init`,
  confirms it validates). Use once, per repo.

### Discover & plan (the "why" and "what")
- **`/ibuild-discover`** — idea → **Vision + PRD + BusinessRequirements**, correctly
  linked. Say: *"I have an idea for…"*, *"capture this product"*, *"write the vision"*.
- **`/ibuild-plan`** — refine business requirements into Functional/Non-functional
  requirements and decompose **Initiative→Epic→Story→Task→Subtask** with `parent`
  and `implements` links; plan cadence with Release/Sprint/Milestone. Say: *"break
  this down"*, *"plan the epic"*, *"create the backlog"*.

### Author & build
- **`/ibuild-author`** — write or update **one** artifact (any type) with correct
  frontmatter + typed links. Reads the type definition at runtime, so fields/IDs
  never drift. Say: *"write a requirement"*, *"add a story/task/test"*.
- **`/ibuild-implement`** — write the real **code + tests** for a Task (or a whole
  Story/Epic), run the test command, then wire `code` + `verified_by` and mark it
  `done` — only once code exists and tests pass. Say: *"implement TASK-0007"*,
  *"build this story"*.

### Fix
- **`/ibuild-bug`** — the bug loop: capture a **Bug**, write a failing regression
  test, find root cause, fix, prove the fix, wire `affects`/`verified_by`, mark
  `resolved`. Say: *"file a bug"*, *"fix this bug"*, *"this is broken"*.

### Review & monitor
- **`/ibuild-audit`** — run the linter, find chain gaps (orphan requirements,
  untested done-tasks, broken/mistyped links, code globs matching nothing) and
  propose minimal fixes. **Detect-and-propose only.** Say: *"audit traceability"*,
  *"what's missing"*, *"run iBuild"*.
- **`/ibuild-contradict`** — find **semantic** contradictions the deterministic
  linter can't see (a task that contradicts its requirement, two NFRs in conflict,
  a test asserting what a story forbids). Reports hypotheses for human review. Say:
  *"check for contradictions"*, *"do these conflict"*.
- **`/ibuild-impact`** — change-impact: given files you changed (or your diff), show
  which Tasks/Requirements/Tests it touches, derived from the graph. Say: *"what
  does this change affect"*, *"blast radius"*.
- **`/ibuild-status`** — traceability dashboard: chain completeness, unimplemented/
  untested requirements, orphan tasks, coverage, rolled up by Release/Epic. Say:
  *"status"*, *"where are we"*, *"coverage"*.

### Ship
- **`/ibuild-ship`** — the gate before shipping: confirm `iBuild validate` is clean
  and the chain is complete, surface blockers, hand off to your PR/ship flow. Say:
  *"ship"*, *"is this ready"*, *"ready to merge"*.

### Evolve an existing system (spec-driven "Change" overlay)
Changing something already built? Use the Change workflow instead of editing blind:
- **`/ibuild-explore`** — no-stakes thinking: read the graph, weigh options, map the
  blast radius (what it would ADD/MODIFY/REMOVE). Writes nothing.
- **`/ibuild-propose`** — capture the evolution as a **Change** artifact (why, scope,
  affected requirements) at `status: proposed`. The "agree before you build" step.
- **`/ibuild-apply`** — carry out the Change: move it to `active`, break it into
  Tasks, implement them, settle the requirement delta.
- **`/ibuild-archive`** — close a delivered Change: confirm the gate is clean, mark
  it `archived`, move it to the archive folder for the audit trail.

---

## 6. The two subagents

Read-only reviewers the skills call (you can also invoke them directly):

- **`ibuild-traceability-auditor`** — runs the linter + reasons over the graph,
  proposes concrete frontmatter fixes to close chain gaps. Never edits/commits.
- **`ibuild-contradiction-checker`** — reasons over artifact *bodies* to surface
  semantic contradictions as confidence-tagged hypotheses. Never edits/commits.

---

## 7. The validate-on-edit hook

`.claude/settings.json` installs a **PostToolUse hook**: after Claude edits or
writes any file, it runs `iBuild validate .` in the background and, if the chain
broke, nudges you to run `/ibuild-audit`. It never blocks and never commits — just
keeps traceability honest as you work.

---

## 8. Doing it without AI (plain CLI)

Everything the skills orchestrate, you can run yourself:

```sh
iBuild validate .        # the gate (0 errors to ship)
iBuild status .          # dashboard
iBuild matrix .          # requirements traceability matrix
iBuild gaps .            # orphan code / untested requirements
iBuild impact src/x.ts   # what a code change affects
iBuild mine --as alice   # your owned + assigned work
iBuild report --kind status   # a status report draft
iBuild instructions Task # a fill-in template for a type
iBuild site . --out portal.html   # offline HTML portal
iBuild serve .           # interactive Studio → http://127.0.0.1:4321
```

The **Studio** (`iBuild serve`) is the visual home: a **Requirements** view grouped
by area, a **kanban Plan** board, click-through **detail** for any artifact,
**Author** forms, a **Review** tab (diff + simulate an edit's impact + discard),
**Operate** (run the gate/tests), **Agent** (agent-assisted edits as reviewable
diffs), **Workspaces**, **My Work**, and **People**.

---

## 9. Make the process your own

The taxonomy is **data, not code**. Edit `docs/types/*.md` — add fields, add typed
relationships, invent artifact types, rename statuses — and `iBuild validate`
follows with zero code changes. `iBuild instructions <Type>` prints the exact
authoring template for anything you define. The chain rules key off names in
`.ibuildos.yaml` (`chain:`), so renaming `implements`/`verifies`/etc. is a config
edit.

---

## 10. Gate it

- **Pre-commit hook:** `iBuild validate . --changed` (fast; only changed artifacts).
- **CI:** run `iBuild validate .` — non-zero exit fails the build. `--format json`
  for machine output + PR annotations. Brownfield: `--baseline` or `--report-only`
  (see §4).

A **Task** may be `status: done` only once its `code` globs match real files, its
`verified_by` tests are `passing`, and it traces to a requirement (directly or via
its parent). That single rule is what makes "done" mean done.
