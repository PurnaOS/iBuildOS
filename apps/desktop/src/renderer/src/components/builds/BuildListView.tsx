import type { JSX } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { BuildStatusBadge } from "./BuildStatusBadge.js";
import { DialWaivedPanel } from "./DialWaivedPanel.js";
import { useBuilds } from "../../hooks/useBuilds.js";
import type { Stream } from "../../../../shared/domain.js";

interface BuildListViewProps {
  projectId: string;
  onOpenBuild: (id: string) => void;
}

/** DESIGN-CHARTER §2's Product sidebar "Build" section, list surface (the
 * "streams grid" in the charter's own engineering shorthand — shown here in
 * Product terms: what story, what's done, tests green or red, per
 * BD-010/PS-008). */
export function BuildListView({ projectId, onOpenBuild }: BuildListViewProps): JSX.Element {
  const { data: builds, isLoading } = useBuilds(projectId);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <h2 className="text-[13px] font-medium">Build</h2>
      <DialWaivedPanel projectId={projectId} />
      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : !builds || builds.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          Nothing is being built yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {builds.map((build) => (
            <BuildCard key={build.id} build={build} onOpen={() => onOpenBuild(build.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BuildCard({ build, onOpen }: { build: Stream; onOpen: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onOpen} className="text-left">
      <Card className="transition-colors duration-150 ease-out hover:bg-muted">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle>{build.storyName}</CardTitle>
          <BuildStatusBadge status={build.status} />
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 pt-0">
          <p className="text-[13px] text-muted-foreground">{build.summary}</p>
          <p className="text-[11px] text-muted-foreground">
            {build.progress.tasksDone} of {build.progress.tasksTotal} tasks done
          </p>
        </CardContent>
      </Card>
    </button>
  );
}
