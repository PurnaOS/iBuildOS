import { defineConfig } from "@playwright/test";

// Smoke-tests the built Electron app (dist/main + dist/preload + dist/renderer)
// end-to-end against the in-memory IPC fake. Not part of `pnpm test` / turbo's
// `test` task — CI has no display server on ubuntu/macos runners today, so this
// is invoked explicitly via `pnpm --filter @ibuildos/desktop test:e2e` (see
// package.json). Run `pnpm build` first.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
});
