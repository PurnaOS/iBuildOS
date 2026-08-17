import { CoreBackend } from "../../main/backend/core.js";
import { InsightsBackend } from "../../main/backend/insights.js";
import { VerificationBackend } from "../../main/backend/verification.js";
import { TEMPLATES } from "../../shared/domain.js";
import type { IbuildosApi } from "../../shared/ipc/client-types.js";

/** A `window.ibuildos` implementation backed by the *real* main-process
 * CoreBackend, InsightsBackend, and VerificationBackend (none has an
 * Electron import, so it's safe to reuse them here) — renderer tests
 * exercise real create/list/subscribe/dashboard/verification logic, not a
 * second, possibly-drifted mock of it. The actual IPC transport (router.ts)
 * has its own coverage in src/shared/ipc/router.test.ts.
 *
 * `backend` (CoreBackend) is kept as its own field, unchanged, for existing
 * callers (App.test.tsx disposes it directly); `insightsBackend` and
 * `verification` are additive, for tests that want to dispose them on their
 * own. `backend.dispose` is also wrapped (own-property override, doesn't
 * touch CoreBackend's class) to release both additional timers too — neither
 * existed when App.test.tsx was written, so its `afterEach` only knows to
 * call `fake.backend.dispose()`; without this, those timers would tick,
 * harmlessly but pointlessly, past the end of every test file that never
 * touches Insights or Verification. */
export function createFakeIbuildos(): {
  api: IbuildosApi;
  backend: CoreBackend;
  insightsBackend: InsightsBackend;
  verification: VerificationBackend;
} {
  const backend = new CoreBackend();
  const insightsBackend = new InsightsBackend();
  const verification = new VerificationBackend();
  const disposeCore = backend.dispose.bind(backend);
  backend.dispose = () => {
    disposeCore();
    insightsBackend.dispose();
    verification.dispose();
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
    verification: {
      preview: {
        get: async ({ targetId }) => ({ preview: verification.getPreview(targetId) }),
        refresh: async ({ targetId }) => ({ preview: verification.refreshPreview(targetId) }),
      },
      tests: {
        get: async ({ targetId }) => ({ run: verification.getTestRun(targetId) }),
        start: async ({ targetId }) => ({ run: verification.startTestRun(targetId) }),
        rerunCase: async ({ targetId, caseId }) => ({ run: verification.rerunCase(targetId, caseId) }),
      },
      acceptance: {
        get: async ({ targetId }) => ({ checklist: verification.getAcceptance(targetId) }),
        decide: async ({ targetId, decision, note, actor }) => ({
          checklist: verification.decide(targetId, decision, note, actor),
        }),
        waive: async ({ targetId, criterionId, reason, actor }) => ({
          checklist: verification.waiveCriterion(targetId, criterionId, reason, actor),
        }),
      },
      merge: {
        get: async ({ targetId }) => ({ result: verification.getMerge(targetId) }),
        finish: async ({ targetId, actor }) => ({ result: verification.finishAndCombine(targetId, actor) }),
      },
      updates: {
        subscribe: (params, onEvent) => verification.subscribe(params.targetId, onEvent),
      },
    },
  };
  return { api, backend, insightsBackend, verification };
}
