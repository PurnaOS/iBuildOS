# CLAUDE.md — durable rules for iBuildOS

iBuildOS is a Git-native SDLC layer on **OKF** (markdown + YAML frontmatter). The
Phase 1 deliverable is `iBuild`, a deterministic traceability linter for the
**Requirement → Task → Code → Test** chain. These rules are load-bearing — keep
them true.

## Non-negotiables

1. **Generic, data-driven validator.** The engine hardcodes *no* taxonomy. The
   only literal type name in the code is the string `"ArtifactType"` (in
   `internal/types`). Every other type is loaded from `docs/types/*.md` at
   runtime. Pointing `--types` at a different directory must change enforcement
   with **zero code changes**. Never write `if type == "Task"`. Polymorphic
   target checks go through `Registry.Satisfies` (built from the runtime
   `extends` graph), never name comparisons.

2. **OKF tolerance.** Don't fork or extend the file format. Consumers must
   tolerate unknown types (warning, never strict-validated), missing optional
   fields, and broken links — never reject the whole bundle. Unknown `type` →
   `doc.unknownType` warning. A reserved/non-`ArtifactType` file in `docs/types/`
   (e.g. `overview.md`, `index.md`) is skipped silently.

3. **Deterministic only.** No AI, no network calls in the linter. All output is
   sorted + deduped (`model.Finalize`); never range a map for output.

## The dialect (defined by `docs/types/artifact-type.md`)

- **Field spec:** `required`, `one_of` (enum), `pattern`, `type`
  (`string`|`number`|`date`|`bool`|`list`), `doc`.
- **Pattern tokens:** `<number>`→`[0-9]+`, `<slug>`→`[a-z0-9]+(?:-[a-z0-9]+)*`,
  `<date>`→`\d{4}-\d{2}-\d{2}`, or `regex:` for raw. Compiled to anchored
  full-match (`\A(?:…)\z`); literal runs are regexp-escaped.
- **Relationship spec:** `target` (must be a defined type), `min` (default 0),
  `max` (optional, unbounded if absent), `doc`.
- **`json_schema:` escape hatch** validates a document's frontmatter *in
  addition* to the dialect. Prefer it over growing the dialect.
- `type: list` (the Phase-1 addition, used by `Task.code`) is a sequence of
  scalars; enum/pattern do not apply to lists.

## Chain semantics (the one sanctioned cross-artifact ruleset)

All chain coupling lives in `config.ChainConfig` — relationship names
(`implements`, `verifies`, `verified_by`, `parent`), the `code` field name, and
the status vocabularies (the one unavoidable value coupling). Completeness rules
key off **capability predicates** derived from the type graph (e.g. "is a
requirement" = is-or-extends the `target` of the `implements` relationship), not
type names. An alternate type set that renames these simply yields no chain
findings while per-document and per-link validation still apply universally.

Phase 1 does **not** add other cross-artifact rules (Epic/Story rollups, Release
contents, etc.) — that's Phase 2. Don't add new artifact *types*.

## The gate

The repo **must pass its own linter**: `go test ./...` runs `TestDogfood`, which
calls `Validate` on the repo root and asserts zero error findings. `iBuild
validate .` must exit 0; `iBuild validate testdata/broken` must exit 1. Keep both
true on every commit — a `Task` may only be `status: done` once its `code` globs
match real files, its `verified_by` tests are `passing`, and it traces to a
requirement (directly or via its parent Story).

## Layout

`cmd/iBuild` (thin) · `internal/okf` (frontmatter + glob, type-agnostic) ·
`internal/types` (Layer 1 registry + dialect) · `internal/validate` (Layer 2a
per-doc, 2b graph + completeness) · `internal/report` (text + stable JSON) ·
`internal/config` · `internal/model` (Finding). Build with `CGO_ENABLED=0`.
