import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// One jsdom environment for the whole package: renderer component tests need
// the DOM, and the main-process IPC router/backend tests are plain functions
// that don't care either way — see src/main/ipc.test.ts (uses an injected
// fake ipcMain, no Electron runtime involved, per T-008's testability goal).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/renderer/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
