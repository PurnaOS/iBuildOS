import { ipcMain } from "electron";
import { registerIpcRouter, type IpcMainLike, type IpcRouter } from "../shared/ipc/router.js";
import type { Backend } from "./backend/index.js";
import { coreHandlers, coreSources } from "./ipc/core.js";
import { verificationHandlers, verificationSources } from "./ipc/verification.js";

// Wires T-008's generic router to this scaffold's per-domain backend facade
// (./backend/index.ts). `ipcMain` satisfies IpcMainLike structurally — the
// router itself has no Electron import, which is what lets router.test.ts
// exercise it without Electron. The handler/source maps are composed from
// each domain's own slice (./ipc/core.ts, ./ipc/verification.ts today;
// future ./ipc/streams.ts, ./ipc/insights.ts) so adding a domain is a new
// file plus a spread line here, not an edit to another domain's slice.
export function createIpcRouter(backend: Backend): IpcRouter {
  return registerIpcRouter(
    ipcMain as unknown as IpcMainLike,
    {
      ...coreHandlers(backend.core),
      ...verificationHandlers(backend.verification),
    },
    {
      ...coreSources(backend.core),
      ...verificationSources(backend.verification),
    },
  );
}
