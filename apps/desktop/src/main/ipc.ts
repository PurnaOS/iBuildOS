import { ipcMain } from "electron";
import { registerIpcRouter, type IpcMainLike, type IpcRouter } from "../shared/ipc/router.js";
import { TEMPLATES } from "../shared/domain.js";
import { InMemoryBackend } from "./backend.js";

// Wires T-008's generic router to this scaffold's in-memory fake. `ipcMain`
// satisfies IpcMainLike structurally — the router itself has no Electron
// import, which is what lets router.test.ts exercise it without Electron.
export function createIpcRouter(backend: InMemoryBackend): IpcRouter {
  return registerIpcRouter(
    ipcMain as unknown as IpcMainLike,
    {
      "projects.list": () => ({ projects: backend.listProjects() }),
      "projects.get": ({ id }) => ({ project: backend.getProject(id) }),
      "projects.create": (input) => ({ project: backend.createProject(input) }),
      "projects.open": ({ id }) => ({ project: backend.openProject(id) }),
      "templates.list": () => ({ templates: [...TEMPLATES] }),
      "attention.list": (input) => ({ items: backend.listAttention(input?.projectId) }),
    },
    {
      "activity.events": (params, emit) => backend.subscribeActivity(params?.projectId, emit),
    },
  );
}
