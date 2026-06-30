# iBuildOS — Claude Code plugin

A Git-native OKF-SDLC workflow for Claude Code. Manage requirements and plan work
as **OKF artifacts** (markdown + YAML frontmatter with typed links), checked by the
deterministic **`iBuild`** linter. The AI **suggests and edits with you — it never
auto-commits and never runs inside the linter.**

## Prerequisite

The `iBuild` binary on your PATH (from the [iBuildOS](https://github.com/PurnaOS/iBuildOS)
repo: `go build -o iBuild ./cmd/iBuild`). The skills orchestrate it.

## Install

```
/plugin marketplace add PurnaOS/iBuildOS
/plugin install ibuildos
```

## The lifecycle

| Stage | Skill | Does |
|---|---|---|
| Adopt | `/ibuild-init` | scaffold the bundle (`iBuild init`) and confirm it validates |
| Discover | `/ibuild-discover` | idea → Vision · PRD · BusinessRequirement |
| Plan | `/ibuild-plan` | FR/NFR + Initiative→Epic→Story→Task→Subtask, releases/sprints |
| Build | `/ibuild-author` | write one artifact correctly (reads `docs/types/` at runtime) |
| Implement | `/ibuild-implement` | write code + tests for a Task/Story, then wire `code`/`verified_by` and flip `done` |
| Fix | `/ibuild-bug` | file a Bug, reproduce, root-cause, fix, wire `affects`/`verified_by`, flip `resolved` |
| Review | `/ibuild-audit` | run the linter, find chain gaps, propose fixes |
| Review | `/ibuild-contradict` | AI finds semantic contradictions across links |
| Monitor | `/ibuild-status` | traceability dashboard from `iBuild graph` |
| Ship | `/ibuild-ship` | gate: validate clean + chain complete, then hand off |

Two read-only subagents back the review skills: `ibuild-traceability-auditor`
(deterministic-first) and `ibuild-contradiction-checker` (AI, semantic). Both are
detect-and-propose; neither edits or commits.

## The change overlay (spec-driven evolution)

For evolving an existing system, a `Change` artifact captures the intent of a
requirement delta as a reviewable, linkable graph node — no parallel folder
hierarchy, no merge engine, git stays the source of truth. The lifecycle mirrors
spec-driven tools:

| Stage | Skill | Does |
|---|---|---|
| Explore | `/ibuild-explore` | read-only: map the blast radius of an idea (what it ADDs/MODIFIes/REMOVEs) |
| Propose | `/ibuild-propose` | author the `Change` (why/what/scope) + `affects` links + any ADDED requirements |
| Apply | `/ibuild-apply` | activate, break down (`/ibuild-plan`), implement (`/ibuild-implement`), settle the delta |
| Archive | `/ibuild-archive` | gate clean + all `delivers` Tasks done → `status: archived`, suggest the `git mv` |

Use discover→plan→implement for greenfield; use explore→propose→apply→archive
when changing a system that already exists. The deltas map onto mechanics iBuildOS
already has — ADDED = a new `proposed` requirement, MODIFIED = edit in place (git
is the diff), REMOVED = `status: deprecated` — so no new dialect and no new gate.

`Scenario` artifacts capture GIVEN/WHEN/THEN acceptance criteria in RFC 2119
language; because a Scenario `verifies` a Requirement, it counts toward chain
completeness exactly like a Test.

## Principles

- **Data-driven.** Skills read the type definitions in `docs/types/` — no taxonomy
  is hardcoded, so editing your types changes the workflow with zero plugin change.
- **Deterministic gate.** `iBuild validate .` is the source of truth; the AI layer
  never runs inside it.
- **Suggest-only.** Agents propose; you approve and commit. State is git, not a
  sidecar.
- **Fast knowledge.** `iBuild graph --node <ref>` gives an artifact's neighborhood
  in one call — the requirements analog of a source-code graph. `iBuild
  instructions <Type>` prints the exact authoring template for a type (from
  `docs/types/`), so skills never hardcode field knowledge.

A `PostToolUse` hook warns (non-blocking) when `iBuild validate` starts failing
after an edit; it no-ops when `iBuild` isn't installed.
