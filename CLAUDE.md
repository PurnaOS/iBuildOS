# CLAUDE.md — durable rules for iBuildOS (TypeScript/Bun)

iBuildOS is a git-native SDLC layer on **OKF** (markdown + YAML frontmatter).
`iBuild` is a deterministic traceability linter + toolchain for the
**Requirement → Task → Code → Test** chain. TypeScript, compiled to a single
self-contained executable with **Bun**. These rules are load-bearing.

## Non-negotiables

1. **Generic, data-driven.** The engine hardcodes *no* taxonomy. The only literal
   type name in `src/` is `"ArtifactType"` (in `src/core/types/registry.ts`).
   Every other type loads from `docs/types/*.md` at runtime. Polymorphic checks go
   through `Registry.satisfies` (is-or-extends over the runtime `extends` graph),
   never name comparison. `scripts/check-literals.ts` fails CI on any taxonomy
   literal outside `registry.ts` (denylist seeded from the profile's `defines:`;
   generated `src/core/scaffold/embedded.ts` is excluded — it is template data).
2. **OKF tolerance.** Unknown `type` → `doc.unknownType` warning, never reject the
   bundle; missing optional fields and broken links are surfaced, never fatal.
3. **Deterministic only.** No AI/network in the linter. All output sorted + deduped
   (`model.finalize`); never iterate a map/object for output. JS `JSON.stringify`
   does NOT sort keys — `graphx/encode.ts` does. CI runs **ubuntu × macos** as the
   byte-identity guard.
4. **Single coupling locus.** All chain coupling lives in `config.ChainConfig`
   (relationship names, code field, status vocabularies). Completeness keys off
   **capability predicates** (`reg.satisfiesAny(t, reg.relTargets(implementsRel))`),
   not type names.

## Layout (`src/core/<module>` mirrors the proven Go boundaries)

`okf` (frontmatter via `yaml` CST + LineCounter; case-exact glob) · `types`
(registry + dialect: required/one_of/pattern/type/extends/abstract/json_schema) ·
`config` (.ibuildos.yaml + ChainConfig + tooling + profile) · `model` (Finding) ·
`validate` (document 2a, graph 2b, code, complete, docslint, baseline, export) ·
`graphx` (graph + focus + encode + rtm + gaps + impact + graphml) ·
`report` (text/json + comms) · `instructions` · `contract` (AGENTS.md) ·
`scaffold` (init + generated `embedded.ts`) · `metrics` (status, mine) ·
`tooling` (orchestrate external test/lint/staleness) · `site` (static HTML portal).
CLI: `src/cli.ts`. AI layer: canonical `plugin/` mirrored to `templates/.claude`.

## Commands

`iBuild validate` (gate; `--changed`/`--base`/`--scope`/`--baseline`/`--report-only`) ·
`baseline` · `graph` (json/graphml, `--node`) · `matrix` (RTM) · `impact` · `gaps` ·
`status` · `mine` · `report` · `check` (unified) · `test` · `site` · `instructions` ·
`agents` · `init` (`--full`/`--example`).

## The gate (run on every change)

`bun test` (dogfood `validate .`→0 errors, broken-fixture exits 1 with exactly
`[chain.doneTaskTestNotPassing, code.noMatch, link.wrongTarget]`, init round-trip,
graph/site determinism, `.claude` mirror + `embedded.ts` drift, OKF conformance) ·
`bun run typecheck` · `bun run check:literals` · `bun run build`. A `Task` may be
`status: done` only once its `code` globs match real files, `verified_by` tests are
`passing`, and it traces to a requirement (directly or via parent).

## Editing the data/AI layers

- Type profile is data: edit `docs/types/*.md` and `iBuild validate` follows with
  zero code change. Keep `templates/profiles/full` ≈ `docs/types`.
- AI layer: `plugin/` is canonical (suggest-only skills + 2 read-only subagents).
  Edit it, then `bun run sync:claude` to refresh `templates/.claude`; the drift gate
  enforces byte-identity. Edit `templates/` → `bun run gen:embedded`.
- The repo **dogfoods itself**: the master spec is decomposed into ~191
  `CatalogRequirement` artifacts under `docs/requirements/<area>/` (status `draft`
  ⇒ no chain findings until scheduled); decisions are ADRs; the rebuild roadmap is
  the adoption Initiative + phase Epics in `docs/work/`. The Go reference is at git
  tag `legacy-go-impl` (and gitignored `.context/scratch/legacy/`).
