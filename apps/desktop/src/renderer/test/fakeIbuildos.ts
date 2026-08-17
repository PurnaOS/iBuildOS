import { CoreBackend } from "../../main/backend/core.js";
import { InsightsBackend } from "../../main/backend/insights.js";
import { TEMPLATES } from "../../shared/domain.js";
import type { IbuildosApi } from "../../shared/ipc/client-types.js";

/** A `window.ibuildos` implementation backed by the *real* main-process
 * CoreBackend and InsightsBackend (neither has an Electron import, so it's
 * safe to reuse them here) — renderer tests exercise real create/list/
 * subscribe/dashboard logic, not a second, possibly-drifted mock of it. The
 * actual IPC transport (router.ts) has its own coverage in
 * src/shared/ipc/router.test.ts.
 *
 * `backend` (CoreBackend) is kept as its own field, unchanged, for existing
 * callers (App.test.tsx disposes it directly); `insightsBackend` is
 * additive, for tests that want to dispose it on its own. `backend.dispose`
 * is also wrapped (own-property override, doesn't touch CoreBackend's class)
 * to release insightsBackend's timer too — InsightsBackend didn't exist when
 * App.test.tsx was written, so its `afterEach` only knows to call
 * `fake.backend.dispose()`; without this, that timer would tick, harmlessly
 * but pointlessly, past the end of every test file that never touches
 * Insights. */
export function createFakeIbuildos(): {
  api: IbuildosApi;
  backend: CoreBackend;
  insightsBackend: InsightsBackend;
} {
  const backend = new CoreBackend();
  const insightsBackend = new InsightsBackend();
  const disposeCore = backend.dispose.bind(backend);
  backend.dispose = () => {
    disposeCore();
    insightsBackend.dispose();
  };
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
    insights: {
      progress: async ({ projectId }) => insightsBackend.getProgress(projectId),
      quality: async ({ projectId }) => insightsBackend.getQuality(projectId),
      workload: async ({ projectId }) => insightsBackend.getWorkload(projectId),
      adoption: async ({ projectId }) => insightsBackend.getAdoptionProgress(projectId),
      myQueue: async ({ projectId }) => insightsBackend.getMyQueue(projectId),
      teamNotes: async ({ projectId }) => insightsBackend.getTeamNotes(projectId),
    },
  };
  return { api, backend, insightsBackend };
}
