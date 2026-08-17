import { useQuery } from "@tanstack/react-query";

// The "insights" domain's dashboards (SPEC.md area IN + TM-004/TM-009) — one
// react-query hook per request, matching useProjects.ts's shape. Every slice
// is a per-project query (see ../../../shared/ipc/contract/insights.ts's
// header comment on why projectId is required, not optional like
// useActivity.ts's attention feed).

export function useProgress(projectId: string) {
  return useQuery({
    queryKey: ["insights", "progress", projectId],
    queryFn: async () => await window.ibuildos.insights.progress({ projectId }),
  });
}

export function useQuality(projectId: string) {
  return useQuery({
    queryKey: ["insights", "quality", projectId],
    queryFn: async () => await window.ibuildos.insights.quality({ projectId }),
  });
}

export function useWorkload(projectId: string) {
  return useQuery({
    queryKey: ["insights", "workload", projectId],
    queryFn: async () => await window.ibuildos.insights.workload({ projectId }),
  });
}

export function useAdoptionProgress(projectId: string) {
  return useQuery({
    queryKey: ["insights", "adoption", projectId],
    queryFn: async () => await window.ibuildos.insights.adoption({ projectId }),
  });
}

// Refetches on the same cadence as InsightsBackend's scripted queue drift
// (see ../../../main/backend/insights.ts) so "My queue" reads as a live,
// derived view rather than a snapshot frozen at first render.
export function useMyQueue(projectId: string) {
  return useQuery({
    queryKey: ["insights", "myQueue", projectId],
    queryFn: async () => await window.ibuildos.insights.myQueue({ projectId }),
    refetchInterval: 6_000,
  });
}

export function useTeamNotes(projectId: string) {
  return useQuery({
    queryKey: ["insights", "teamNotes", projectId],
    queryFn: async () => await window.ibuildos.insights.teamNotes({ projectId }),
  });
}
