# @ibuildos/cli

The headless `ibuildos` CLI — a thin command surface over @ibuildos/engine (T-009, DEFAULTS #13).

**Status:** the FORMATS.md §12 command surface is implemented — `validate`,
`gate <name>`, `baseline write|show`, `rules`, `gates`, `instructions <Type>`,
`graph export|matrix` — with exact exit codes (0/1/2/3/4) and findings JSON
matching `@ibuildos/schemas`' `FindingsReportSchema`. See `src/run.ts` for the
dispatch entry and `src/rules/checkers.ts` for exactly which FORMATS §6 rules
are wired up versus documented as a gap for later work (chain/*, evid/*,
contract/*, merge/*, guidance/stale, state/legal|approved|derived, and
doc/body-link — each needs bundle-external context, e.g. a git-diff-derived
previous state or a tracked-file listing, that a headless bundle load alone
doesn't supply).

The engine stays pure/in-memory by design; this package owns all filesystem
walking (`src/bundle/walk.ts`, `src/bundle/load.ts`) and git shelling
(`src/git.ts`).

**Known gap:** the declared `bin` (`./src/cli.ts`) cannot yet be invoked via
a bare `node packages/cli/src/cli.ts` — Node's native TypeScript type
stripping doesn't resolve the `.js`-suffixed relative import specifiers
NodeNext module resolution requires back to their sibling `.ts` source files.
This is a repo-wide condition (packages/stub-agent's identically-shaped `bin`
has the same gap), not specific to this package; a build step (T-009's
"bundled (esbuild)") is the eventual fix. In the meantime, `src/run.ts`'s
`runCli()` is the fully-tested, directly-callable dispatch — see `test/`.
