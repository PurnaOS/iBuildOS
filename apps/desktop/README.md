# @ibuildos/desktop

The Electron desktop app: main/preload/renderer (T-001/T-003/T-008).

## Status

Scaffolded: Electron + Vite + React 19 + TypeScript (strict) + Tailwind CSS +
Radix primitives, a hand-rolled zod-validated IPC router (T-008), and the app
shell per `docs/spec/DESIGN-CHARTER.md`'s navigation map (Home <-> Project
window, Product/Engineering mode switch, ⌘K palette, ⌘J attention queue, ⌘L
chat panel skeleton).

Everything is backed by an **in-memory fake** (`src/main/backend/`, one file
per domain — `core.ts` today, `streams.ts`/`insights.ts` placeholders for
later, composed by `index.ts`) — no real git/filesystem/ACP calls.
`packages/engine` has no build step yet and is not imported here; wiring the
real engine, ACP layer, and previews into this shell is later milestone work
(`docs/spec/EXECUTION-PLAN.md` M4+).

## Layout

```
src/
  shared/         IPC contract (zod schemas) + the injectable router core,
                  domain types (Project/Template/ActivityEvent) — imported by
                  both main and renderer, never Electron-specific.
  main/           App lifecycle, window creation, the in-memory backend, and
                  the router wired to it.
  preload/        contextBridge-exposed `window.ibuildos` API — the only door
                  from renderer to main (context isolation on, no
                  nodeIntegration).
  renderer/       React app: Home, Project window, the shared component set
                  (button/card/badge/input/dialog/switch/separator), state
                  (Zustand for shell UI state, TanStack Query over the IPC
                  contract).
e2e/              Playwright smoke test against the *built* app.
```

## A scoped simplification worth naming

DESIGN-CHARTER's nav map describes a "Project window" as distinct from Home.
This scaffold renders it as a view within the single app window (client-side
navigation) rather than opening a second OS-level `BrowserWindow` — real
multi-window lifecycle (and the IPC plumbing a second window needs) is more
than this milestone's scope calls for. Nothing about the IPC contract,
component boundaries, or the Product/Engineering mode split assumes
otherwise, so promoting it to a real second window later is additive.

## Commands

- `pnpm --filter @ibuildos/desktop dev` — electron-vite dev server + Electron,
  hot-reloading.
- `pnpm --filter @ibuildos/desktop build` — builds `dist/main`, `dist/preload`,
  `dist/renderer`.
- `pnpm --filter @ibuildos/desktop typecheck` — strict TS across main+preload
  (Node types) and renderer (DOM types) via separate tsconfigs.
- `pnpm --filter @ibuildos/desktop test` — Vitest (jsdom): the IPC router
  against a fake `ipcMain` (no Electron needed), the in-memory backend, and
  React component/integration tests — including a PS-006 vocabulary-glossary
  check that scans rendered Product-mode text against
  `DESIGN-CHARTER.md`'s banned-terms table.
- `pnpm --filter @ibuildos/desktop test:e2e` — Playwright, driving the *built*
  Electron app (`pnpm build` first). Not part of `pnpm test` / turbo's `test`
  task, since CI's ubuntu/macos runners don't reliably have a display server.

  **Worth knowing:** this version of the `electron` package has no
  `postinstall` script (checked: its `package.json` declares none). It
  downloads its ~100MB binary **lazily**, the first time something actually
  does `require("electron")` — `electron-vite dev`/`build`, or `dev`/`build`/
  `test:e2e` scripts that shell out to the `electron` CLI — not during `pnpm
  install`. First run of any of those in a fresh environment prints
  "Downloading Electron binary..." and takes a few extra seconds; every run
  after that is instant. This also means `pnpm typecheck` and `pnpm test`
  never trigger it (no Vitest test imports `electron`, by design —
  `src/main/backend/` and `src/shared/ipc/router.ts` are Electron-free —
  and turbo's `typecheck`/`test` tasks don't run this package's own `build`),
  so it costs nothing on CI's ubuntu/macos/windows `typecheck`+`test` jobs.
