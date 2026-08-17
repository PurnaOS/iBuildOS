import type { RequestHandlers, ChannelSources } from "../../shared/ipc/router.js";
import type { VerificationBackend } from "../backend/verification.js";

// The "verification" domain's slice of the IPC surface (preview/tests/
// acceptance/merge) -- wired to ../backend/verification.ts's
// VerificationBackend. Composed into the full RequestHandlers/ChannelSources
// maps by ../ipc.ts, alongside ./core.ts (and future ./streams.ts,
// ./insights.ts) -- the same spread pattern as
// src/shared/ipc/contract.ts.

export function verificationHandlers(
  verification: VerificationBackend,
): Pick<
  RequestHandlers,
  | "verification.preview.get"
  | "verification.preview.refresh"
  | "verification.tests.get"
  | "verification.tests.start"
  | "verification.tests.rerunCase"
  | "verification.acceptance.get"
  | "verification.acceptance.decide"
  | "verification.acceptance.waive"
  | "verification.merge.get"
  | "verification.merge.finish"
> {
  return {
    "verification.preview.get": ({ targetId }) => ({ preview: verification.getPreview(targetId) }),
    "verification.preview.refresh": ({ targetId }) => ({ preview: verification.refreshPreview(targetId) }),
    "verification.tests.get": ({ targetId }) => ({ run: verification.getTestRun(targetId) }),
    "verification.tests.start": ({ targetId }) => ({ run: verification.startTestRun(targetId) }),
    "verification.tests.rerunCase": ({ targetId, caseId }) => ({ run: verification.rerunCase(targetId, caseId) }),
    "verification.acceptance.get": ({ targetId }) => ({ checklist: verification.getAcceptance(targetId) }),
    "verification.acceptance.decide": ({ targetId, decision, note, actor }) => ({
      checklist: verification.decide(targetId, decision, note, actor),
    }),
    "verification.acceptance.waive": ({ targetId, criterionId, reason, actor }) => ({
      checklist: verification.waiveCriterion(targetId, criterionId, reason, actor),
    }),
    "verification.merge.get": ({ targetId }) => ({ result: verification.getMerge(targetId) }),
    "verification.merge.finish": ({ targetId, actor }) => ({
      result: verification.finishAndCombine(targetId, actor),
    }),
  };
}

export function verificationSources(
  verification: VerificationBackend,
): Pick<ChannelSources, "verification.updates"> {
  return {
    "verification.updates": ({ targetId }, emit) => verification.subscribe(targetId, emit),
  };
}
