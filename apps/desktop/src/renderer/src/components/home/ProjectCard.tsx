import type { JSX } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { StatusBadge } from "../ui/badge.js";
import { TEMPLATES, type Project } from "../../../../shared/domain.js";

interface ProjectCardProps {
  project: Project;
  onOpen: (id: string) => void;
}

// PS-002: Home lists projects "with their live state (active streams, pending
// approvals, gate status)" — rendered here in Product-mode vocabulary
// ("build" not "stream", "checks" not "gate").
export function ProjectCard({ project, onOpen }: ProjectCardProps): JSX.Element {
  const template = TEMPLATES.find((t) => t.id === project.template);
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(project.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen(project.id);
      }}
      className="cursor-pointer transition-colors duration-150 ease-out hover:bg-muted"
    >
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>{project.name}</CardTitle>
          <p className="text-[11px] text-muted-foreground">{template?.name ?? project.template}</p>
        </div>
        <StatusBadge status={project.checksStatus} />
      </CardHeader>
      <CardContent className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span>
          {project.activeBuilds} build{project.activeBuilds === 1 ? "" : "s"} in progress
        </span>
        <span>
          {project.pendingApprovals} waiting on you
        </span>
      </CardContent>
    </Card>
  );
}
