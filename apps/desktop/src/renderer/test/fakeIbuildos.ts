import { CoreBackend } from "../../main/backend/core.js";
import { VerificationBackend } from "../../main/backend/verification.js";
import { TEMPLATES } from "../../shared/domain.js";
import type { IbuildosApi } from "../../shared/ipc/client-types.js";

/** A `window.ibuildos` implementation backed by the *real* main-process
 * CoreBackend and VerificationBackend (neither has an Electron import, so
 * it's safe to reuse them here) — renderer tests exercise real
 * create/list/subscribe logic, not a second, possibly-drifted mock of it.
 * The actual IPC transport (router.ts) has its own coverage in
 * src/shared/ipc/router.test.ts. */
export function createFakeIbuildos(): {
  api: IbuildosApi;
  backend: CoreBackend;
  verification: VerificationBackend;
} {
  const backend = new CoreBackend();
  const verification = new VerificationBackend();
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
  return { api, backend, verification };
}
