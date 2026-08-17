import type { JSX } from "react";
import { CheckCircle2, HelpCircle, ListChecks, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { StatusBadge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { useActivityFeed } from "../../hooks/useActivity.js";
import { TEMPLATES, type ActivityEvent, type Project } from "../../../../shared/domain.js";

interface ProductOverviewProps {
  project: Project;
}

const KIND_ICON: Record<ActivityEvent["kind"], typeof MessageSquare> = {
  note: MessageSquare,
  question: HelpCircle,
  approval: CheckCircle2,
  check: ListChecks,
};

// DESIGN-CHARTER §2: "Overview (progress, activity, trunk preview launcher)."
// "Trunk" is banned in Product mode (§4) — shown here as "the live product."
export function ProductOverview({ project }: ProductOverviewProps): JSX.Element {
  const template = TEMPLATES.find((t) => t.id === project.template);
  const activity = useActivityFeed({ projectId: project.id });

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-medium">{project.name}</h2>
          <p className="text-[11px] text-muted-foreground">{template?.name ?? project.template}</p>
        </div>
        <StatusBadge status={project.checksStatus} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-[11px] font-normal text-muted-foreground">
              Builds in progress
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[20px] font-medium">{project.activeBuilds}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-[11px] font-normal text-muted-foreground">
              Waiting on you
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[20px] font-medium">{project.pendingApprovals}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-[11px] font-normal text-muted-foreground">
              Live product
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="outline" disabled>
              Open preview
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-0.5 pt-0" role="log" aria-live="polite">
          {activity.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              Nothing has happened yet.
            </p>
          ) : (
            activity.map((event) => {
              const Icon = KIND_ICON[event.kind];
              return (
                <div key={event.id} className="flex items-start gap-2.5 rounded-md px-1.5 py-1.5">
                  <Icon
                    className={
                      "mt-0.5 h-3.5 w-3.5 shrink-0 " +
                      (event.needsAttention ? "text-state-blocked" : "text-muted-foreground")
                    }
                    aria-hidden
                  />
                  <span className="text-[13px]">{event.message}</span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
