---
name: ibuild-init
description: >
  Set up the current project as an iBuildOS OKF-SDLC bundle so requirements,
  work, and tests live in git as validated artifacts. Runs `iBuild init`, which
  scaffolds .ibuildos.yaml, the docs/types/ profile, the bundle directories, a
  starter CLAUDE.md, the develop-with-iBuildOS guide, and a vendored .claude/
  (the iBuild skills + auditor/contradiction-checker agents + validate-on-edit
  hook) so the repo is self-contained — then confirms the bundle validates. Use
  when the user says "set up iBuildOS", "init the bundle",
  "add OKF-SDLC to this repo", "start managing requirements here", or is starting
  a new project and wants the requirements/planning workflow.
---

# iBuild Init

Make this repo iBuildOS-native: a deterministic gate (`iBuild validate`) plus the
authoring skills, with git as the single source of truth.

## Procedure

1. **Check for `iBuild`.** Run `iBuild version`. If it is not on PATH, tell the
   user to build it (`go build -o iBuild ./cmd/iBuild` from the iBuildOS repo, or
   install the release) and stop — every other skill depends on it.
2. **Check for an existing bundle.** If `.ibuildos.yaml` already exists, say so;
   `iBuild init` is idempotent and will only add missing files, never overwrite.
3. **Scaffold.** Run `iBuild init .` (add `--example` if the user wants a sample
   requirement to see the shape). Show the created-files summary.
4. **Confirm the gate.** Run `iBuild validate .` and confirm it exits 0 — an
   empty bundle is a valid bundle.
5. **Point the way.** Tell the user the lifecycle and the next step:
   - capture an idea → `/ibuild-discover`
   - plan and break down work → `/ibuild-plan`
   - write one artifact → `/ibuild-author`
   The full walkthrough is in `docs/develop-with-ibuildos.md`.
   Note the vendored `.claude/` now ships the iBuild skills/agents into this
   repo — they work on clone without a marketplace install. Suggest committing it.

## Boundaries

- `iBuild init` never overwrites; if a file conflicts it is left untouched and the
  user merges manually. Do not force or delete anything.
- You scaffold; you do not `git add`/`commit`. Let the user commit.
- The linter is deterministic and AI-free. This skill only runs it.
