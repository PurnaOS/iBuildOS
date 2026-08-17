import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// T-001 (Electron) + T-003 (React 19/Vite/Tailwind/Radix): electron-vite drives
// all three processes from one config. Build output goes to dist/** (not the
// electron-vite default out/**) because turbo.json declares outputs: ["dist/**"]
// and the repo .gitignore already covers dist/ — see CLAUDE.md's monorepo layout.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/main",
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
      },
    },
  },
  preload: {
    // Unlike main, preload does NOT use externalizeDepsPlugin: a sandboxed
    // preload's `require` is a restricted Node/Electron built-in allowlist —
    // `require("zod")` fails at runtime even though the file itself loads
    // fine (confirmed empirically). That's why src/preload/index.ts imports
    // channel-names.ts (plain string constants) instead of contract.ts (which
    // pulls in zod) for anything it needs at runtime — so this build has
    // nothing but Electron's own `electron` import to externalize.
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
        // Force CJS output despite package.json's "type": "module": Electron's
        // sandboxed preload context (webPreferences.sandbox: true, see
        // src/main/index.ts) cannot load an ESM preload script — "Cannot use
        // import statement outside a module" — also confirmed empirically.
        // main/renderer stay ESM; only preload is pinned to CJS.
        output: {
          format: "cjs",
          entryFileNames: "index.js",
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    build: {
      outDir: resolve(__dirname, "dist/renderer"),
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
    plugins: [react()],
  },
});
