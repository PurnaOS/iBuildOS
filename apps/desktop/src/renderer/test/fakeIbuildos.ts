import { CoreBackend } from "../../main/backend/core.js";
import { TEMPLATES } from "../../shared/domain.js";
import type { IbuildosApi } from "../../shared/ipc/client-types.js";

/** A `window.ibuildos` implementation backed by the *real* main-process
 * CoreBackend (it has no Electron import, so it's safe to reuse here) —
 * renderer tests exercise real create/list/subscribe logic, not a second,
 * possibly-drifted mock of it. The actual IPC transport (router.ts) has its
 * own coverage in src/shared/ipc/router.test.ts. */
export function createFakeIbuildos(): { api: IbuildosApi; backend: CoreBackend } {
  const backend = new CoreBackend();
  const api: IbuildosApi = {
    projects: {
      list: async () => ({ projects: backend.listProjects() }),
      get: async ({ id }) => ({ project: backend.getProject(id) }),
      create: async (input) => ({ project: backend.createProject(input) }),
      open: async ({ id }) => ({ project: backend.openProject(id) }),
    },
    templates: {
      list: async () => ({ templates: [...TEMPLATES] }),
    },
    attention: {
      list: async (input) => ({ items: backend.listAttention(input?.projectId) }),
    },
    activity: {
      subscribe: (params, onEvent) => backend.subscribeActivity(params?.projectId, onEvent),
    },
  };
  return { api, backend };
}
