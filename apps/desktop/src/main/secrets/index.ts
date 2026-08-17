import { join } from "node:path";
import { app, safeStorage } from "electron";
import type { MachineLocalDirResolver } from "@ibuildos/engine";
import { ElectronSecretStore } from "./secret-store.js";

// Real-Electron wiring for ./secret-store.ts's ElectronSecretStore — the
// only file in this module that imports "electron" (mirrors src/main/ipc.ts
// wiring the real `ipcMain` to the Electron-free router in
// src/shared/ipc/router.ts; see that file's comment). secret-store.ts stays
// importable and testable under plain Vitest because it never does this.
export {
  ElectronSecretStore,
  type ElectronSecretStoreOptions,
  type SafeStorageLike,
} from "./secret-store.js";

// PS-014's machine-local-state root: one directory per project under
// Electron's per-user app-data directory, so it survives app restarts and
// (unlike a repo-relative path) is unaffected by the project's git worktree
// moving, renaming, or being freshly re-cloned. Every machine-local concern
// PS-014 lists (secret values here; agent connections/transcripts are other
// modules' future concern) shares this same per-project directory rather
// than each inventing its own root.
const machineLocalDir: MachineLocalDirResolver = (projectId) =>
  join(app.getPath("userData"), "projects", projectId);

/**
 * Builds a real, safeStorage-backed `SecretStore` for one (project,
 * environment) pair.
 *
 * Must be called after Electron's `app` has emitted `'ready'` —
 * `safeStorage.isEncryptionAvailable()` / `getSelectedStorageBackend()`
 * report unreliable values beforehand (see secret-store.ts's
 * `computeRefusal()` comment), which would cause a false refusal (or,
 * worse, a false pass) depending on platform and timing.
 */
export function createSecretStore(
  projectId: string,
  environment: string,
  options?: { allowInsecureStorage?: boolean },
): ElectronSecretStore {
  return new ElectronSecretStore({
    projectId,
    environment,
    safeStorage,
    machineLocalDir,
    ...(options?.allowInsecureStorage !== undefined
      ? { allowInsecureStorage: options.allowInsecureStorage }
      : {}),
  });
}
