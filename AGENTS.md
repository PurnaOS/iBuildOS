# AGENTS.md — iBuildOS v2

iBuildOS v2 is a desktop app where a product person and an architect drive
parallel AI coding agents — over the open **Agent Client Protocol (ACP)** —
through a UI. The git repository (code + OKF documents) is the single source
of truth; a deterministic, AI-free engine is the sole authority on "done."

This repository is itself being rebuilt as iBuildOS v2 (a from-scratch rewrite
of the v0.5 CLI, archived at branch `archive/v1-cli`). If you are an agent
working in this repo, you are helping build the platform, not yet using it —
`docs/spec/` is the specification you're implementing against, in this order
of authority: `SPEC.md` (intent) → `FORMATS.md` (bytes) → `TECH-STACK.md`
(technology) → `DEFAULTS.md` (shipped policy) → `ACCEPTANCE.md` (done-when
oracles) → `EXECUTION-PLAN.md` (milestone sequencing + the Builder Charter for
how to make and record in-session decisions).

## Commands

pnpm workspace, Turborepo-orchestrated:

- `pnpm typecheck` — strict TypeScript across every package (`turbo run typecheck`).
- `pnpm test` — Vitest across every package (`turbo run test`).
- `pnpm --filter @ibuildos/<pkg> <script>` — run a script in one package only.

There is no `iBuildOS` CLI to drive yet in the product sense — `packages/cli`
is a placeholder until M1/M2 land it (see that package's README). Once it
exists, it will expose `ibuildos validate`, `ibuildos gate <name>`, etc., per
`docs/spec/FORMATS.md` §12.

## Rules for agents working on this repo

- Follow `CLAUDE.md`'s document-precedence order and non-negotiables — this
  file doesn't restate them.
- The engine's OKF store (`packages/engine/src/store/`) is CST-based on
  purpose (byte-preserving round-trip edits). Don't introduce a `Document`-API
  shortcut that reformats untouched frontmatter — see CLAUDE.md's "Editing the
  OKF store" section and the round-trip tests in
  `packages/engine/src/store/okf-document.test.ts`.
- New packages under `packages/*` or `apps/*` follow the layout named in
  `docs/spec/TECH-STACK.md` §3 — don't invent a different shape.
- No AI/network calls inside `packages/engine` (the deterministic gate) or
  `packages/stub-agent` (deterministic test double) — ever.
- Record a genuine in-session judgment call (a name, a shape, a default not
  specified anywhere in `docs/spec/`) as a `builder-decision` per the
  EXECUTION-PLAN.md Builder Charter, once `docs/decisions/` exists for v2 —
  don't silently invent and move on.
