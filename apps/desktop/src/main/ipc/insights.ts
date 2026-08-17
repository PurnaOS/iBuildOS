import type { RequestHandlers } from "../../shared/ipc/router.js";
import type { InsightsBackend } from "../backend/insights.js";

// The "insights" domain's slice of the IPC surface (dashboards, workload,
// adoption burndown, my queue, team notes) — wired to
// ../backend/insights.ts's InsightsBackend. Composed into the full
// RequestHandlers map by ../ipc.ts, the same spread pattern as
// ./core.ts. No subscription channels — every insights slice here is a plain
// per-project query, refetched by the renderer rather than pushed live (see
// backend/insights.ts's header comment on that scope call).

export function insightsHandlers(
  insights: InsightsBackend,
): Pick<
  RequestHandlers,
  | "insights.progress"
  | "insights.quality"
  | "insights.workload"
  | "insights.adoption"
  | "insights.my-queue"
  | "insights.team-notes"
> {
  return {
    "insights.progress": ({ projectId }) => insights.getProgress(projectId),
    "insights.quality": ({ projectId }) => insights.getQuality(projectId),
    "insights.workload": ({ projectId }) => insights.getWorkload(projectId),
    "insights.adoption": ({ projectId }) => insights.getAdoptionProgress(projectId),
    "insights.my-queue": ({ projectId }) => insights.getMyQueue(projectId),
    "insights.team-notes": ({ projectId }) => insights.getTeamNotes(projectId),
  };
}
