# iBuildOS
iBuildOS is an AI-native Software Development Operating System that turns Git into the single source of truth for the entire SDLC. It manages ideas, requirements, architecture, tasks, code, tests, and releases as structured knowledge, replacing fragmented tools like Jira and Confluence with a unified, version-controlled platform.

## `iBuild` — the traceability linter (Phase 1)

`iBuild` is a deterministic, OKF-conformant linter that validates the
**Requirement → Task → Code → Test** chain across your repo. It hardcodes no
taxonomy: every artifact type is defined as a self-describing markdown document
under `docs/types/`, so a different `docs/types/` enforces a different process
with zero code changes.

### Build & run

```sh
CGO_ENABLED=0 go build -o iBuild ./cmd/iBuild
./iBuild validate .                 # validate the bundle in the current dir
./iBuild validate . --format json   # machine-readable report (for CI)
./iBuild validate . --types <dir>   # use an alternative type set
```

Exit codes: `0` = no errors, `1` = validation errors, `2` = usage error.
Warnings never fail the build.

### Bundle config (`.ibuildos.yaml`)

```yaml
root: docs            # knowledge-bundle root
types: types          # type definitions, resolving to docs/types/
artifacts:            # globs (relative to root) marking which files are artifacts
  - requirements/**
  - work/**
  - tests/**
code_field: code      # the Task field holding repo-relative code globs
```

Only files matched by `artifacts` are strict-validated; `README.md`, `docs/types/`,
and source code stay out of scope. Typed links (`links:`) use root-relative
paths (e.g. `/requirements/fr-0001.md`); a Task's `code` globs are repo-relative.

### JSON report contract

`--format json` emits a stable, sorted, deduped report:

```json
{
  "version": "1",
  "summary": { "errors": 0, "warnings": 0 },
  "findings": [
    {
      "severity": "error",
      "file": "docs/work/task-0003.md",
      "line": 9,
      "rule": "link.unresolved",
      "message": "implements link \"/requirements/fr-9999.md\" does not resolve to an existing document"
    }
  ]
}
```

`severity` is `error`|`warning`; `file` is a bundle-relative POSIX path; `line`
is omitted when unknown; `rule` is a stable dotted identifier. Findings are
sorted by `(file, line, rule, message)` so CI diffs are byte-identical. The
GitHub Action (`.github/workflows/validate.yml`) parses this to emit PR
annotations.

iBuildOS is built with iBuildOS: `go test ./...` runs `TestDogfood`, which asserts
`iBuild validate .` finds zero errors on this repo.

## Authoring & planning (Phases 2–4)

Phase 1 is the gate. Phases 2–4 add the layer that makes a bundle pleasant to
author and keep honest: a scaffolder, a knowledge-graph export, and a Claude Code
plugin that drives the whole lifecycle. The linter stays deterministic and AI-free;
the AI layer wraps it and is always suggest-only.

### `iBuild init` — scaffold a new project

```sh
./iBuild init .            # scaffold .ibuildos.yaml, docs/types/, the bundle dirs, the guide
./iBuild init . --example  # also drop a tiny example requirement
```

Writes the base OKF-SDLC profile and a clean bundle that `iBuild validate .` passes
immediately. It **never overwrites** an existing file, so it is safe to re-run.

### `iBuild graph` — the knowledge graph (fast LLM context)

`iBuild graph` derives the typed artifact graph by walking frontmatter links — the
requirements analog of a source-code graph (SCIP/LSIF). Deterministic, sorted, no
server: an agent (or you) gets structured context in one call instead of grepping.

```sh
./iBuild graph .                                          # whole graph, JSON
./iBuild graph . --node /work/task-0001.md --depth 1     # one node + its neighbors
./iBuild graph . --node /requirements/fr-0001.md --rel implements,verified_by
./iBuild graph . --body full                             # full bodies (for semantic review)
```

Nodes carry `type`, `status`, a generic `fields` map (no taxonomy hardcoded), and a
body excerpt; edges carry the relationship, declared `target`, actual `targetType`,
and `resolved` (dangling links still appear). See `docs/develop-with-ibuildos.md`.

### The Claude Code plugin

`plugin/` is an installable plugin (`/plugin marketplace add PurnaOS/iBuildOS`) that
adds the lifecycle skills — `/ibuild-init`, `/ibuild-discover`, `/ibuild-plan`,
`/ibuild-author`, `/ibuild-implement`, `/ibuild-bug`, `/ibuild-audit`,
`/ibuild-contradict`, `/ibuild-status`, `/ibuild-ship` — plus two read-only subagents (a traceability auditor and an AI
contradiction-checker). All of it reads `docs/types/` at runtime and defers to
`iBuild validate`; none of it commits on its own.
