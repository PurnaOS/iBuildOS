import { Backend } from "../../main/backend/index.js";
import { TEMPLATES } from "../../shared/domain.js";
import type { IbuildosApi } from "../../shared/ipc/client-types.js";

/** A `window.ibuildos` implementation backed by the *real* main-process
 * Backend facade (it has no Electron import, so it's safe to reuse here) —
 * renderer tests exercise real create/list/subscribe logic, not a second,
 * possibly-drifted mock of it. The actual IPC transport (router.ts) has its
 * own coverage in src/shared/ipc/router.test.ts. Returns `backend` (not
 * `core`) so `fake.backend.dispose()` tears down every domain's timers,
 * streams included. */
export function createFakeIbuildos(): { api: IbuildosApi; backend: Backend } {
  const backend = new Backend();
  const api: IbuildosApi = {
    projects: {
      list: async () => ({ projects: backend.core.listProjects() }),
      get: async ({ id }) => ({ project: backend.core.getProject(id) }),
      create: async (input) => ({ project: backend.core.createProject(input) }),
      open: async ({ id }) => ({ project: backend.core.openProject(id) }),
    },
    templates: {
      list: async () => ({ templates: [...TEMPLATES] }),
    },
    attention: {
      list: async (input) => ({ items: backend.core.listAttention(input?.projectId) }),
    },
    activity: {
      subscribe: (params, onEvent) => backend.core.subscribeActivity(params?.projectId, onEvent),
    },
    streams: {
      list: async ({ projectId }) => ({ streams: backend.streams.listStreams(projectId) }),
      get: async ({ id }) => ({ stream: backend.streams.getStream(id) }),
      getDial: async ({ projectId }) => ({ dial: backend.streams.getDial(projectId) }),
      setDial: async ({ projectId, dial }) => ({
        dial: backend.streams.setDial(projectId, dial),
      }),
      answerQuestion: async ({ streamId, questionId, answer }) => ({
        stream: backend.streams.answerQuestion(streamId, questionId, answer),
      }),
      steer: async ({ streamId, instruction }) => ({
        stream: backend.streams.steer(streamId, instruction),
      }),
      remediate: async ({ streamId, action, instruction }) => ({
        stream: backend.streams.remediate(streamId, action, instruction),
      }),
      listDialWaived: async (input) => ({
        items: backend.streams.listDialWaived(input?.projectId),
      }),
      markDialWaivedReviewed: async ({ id }) => ({
        item: backend.streams.markDialWaivedReviewed(id),
      }),
      subscribe: (params, onEvent) => backend.streams.subscribeStreams(params?.projectId, onEvent),
    },
  };
  return { api, backend };
}
