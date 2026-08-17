import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcceptanceChecklist,
  AcceptanceDecision,
  MergeResult,
  PreviewState,
  TestRun,
} from "../../../shared/ipc/contract/verification.js";

// The "verification" domain's data hooks (previews/tests/acceptance/merge —
// PV/TX/RV, IG-003). Same shape as ../hooks/useProjects.ts/useActivity.ts:
// TanStack Query for the request/response half of the IPC contract, plain
// subscribe/unsubscribe for the live half.

const keys = {
  preview: (targetId: string) => ["verification", "preview", targetId] as const,
  tests: (targetId: string) => ["verification", "tests", targetId] as const,
  acceptance: (targetId: string) => ["verification", "acceptance", targetId] as const,
  merge: (targetId: string) => ["verification", "merge", targetId] as const,
};

export function usePreview(targetId: string) {
  return useQuery({
    queryKey: keys.preview(targetId),
    queryFn: async () => (await window.ibuildos.verification.preview.get({ targetId })).preview,
  });
}

export function useRefreshPreview(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await window.ibuildos.verification.preview.refresh({ targetId })).preview,
    onSuccess: (preview) => queryClient.setQueryData<PreviewState>(keys.preview(targetId), preview),
  });
}

export function useTestRun(targetId: string) {
  return useQuery({
    queryKey: keys.tests(targetId),
    queryFn: async () => (await window.ibuildos.verification.tests.get({ targetId })).run,
  });
}

export function useStartTestRun(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await window.ibuildos.verification.tests.start({ targetId })).run,
    onSuccess: (run) => queryClient.setQueryData<TestRun | null>(keys.tests(targetId), run),
  });
}

export function useRerunCase(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (caseId: string) =>
      (await window.ibuildos.verification.tests.rerunCase({ targetId, caseId })).run,
    onSuccess: (run) => queryClient.setQueryData<TestRun | null>(keys.tests(targetId), run),
  });
}

export function useAcceptance(targetId: string) {
  return useQuery({
    queryKey: keys.acceptance(targetId),
    queryFn: async () => (await window.ibuildos.verification.acceptance.get({ targetId })).checklist,
  });
}

/** A "pending" checklist has no decision to submit — only these three are
 * ever sent over the wire (see ../../../shared/ipc/contract/verification.ts's
 * "verification.acceptance.decide" request). */
export type SubmittableAcceptanceDecision = Exclude<AcceptanceDecision, "pending">;

export function useDecideAcceptance(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { decision: SubmittableAcceptanceDecision; note?: string | undefined }) =>
      (
        await window.ibuildos.verification.acceptance.decide({
          targetId,
          decision: input.decision,
          note: input.note,
        })
      ).checklist,
    onSuccess: (checklist) => queryClient.setQueryData<AcceptanceChecklist>(keys.acceptance(targetId), checklist),
  });
}

export function useWaiveCriterion(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { criterionId: string; reason: string }) =>
      (
        await window.ibuildos.verification.acceptance.waive({
          targetId,
          criterionId: input.criterionId,
          reason: input.reason,
        })
      ).checklist,
    onSuccess: (checklist) => queryClient.setQueryData<AcceptanceChecklist>(keys.acceptance(targetId), checklist),
  });
}

export function useMergeResult(targetId: string) {
  return useQuery({
    queryKey: keys.merge(targetId),
    queryFn: async () => (await window.ibuildos.verification.merge.get({ targetId })).result,
  });
}

export function useFinishAndCombine(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await window.ibuildos.verification.merge.finish({ targetId })).result,
    onSuccess: (result) => queryClient.setQueryData<MergeResult>(keys.merge(targetId), result),
  });
}

/** Keeps all four verification queries for `targetId` live via the single
 * "verification.updates" subscription channel -- one wire subscription
 * feeds every card on the Acceptance view. */
export function useVerificationUpdates(targetId: string): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unsubscribe = window.ibuildos.verification.updates.subscribe({ targetId }, (update) => {
      if (update.kind === "preview") queryClient.setQueryData(keys.preview(targetId), update.preview);
      else if (update.kind === "testRun") queryClient.setQueryData(keys.tests(targetId), update.run);
      else if (update.kind === "acceptance") queryClient.setQueryData(keys.acceptance(targetId), update.checklist);
      else queryClient.setQueryData(keys.merge(targetId), update.result);
    });
    return unsubscribe;
  }, [targetId, queryClient]);
}
