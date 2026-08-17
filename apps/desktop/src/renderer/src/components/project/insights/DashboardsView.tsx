import type { JSX } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card.js";
import { StatusBadge } from "../../ui/badge.js";
import { useProgress, useQuality, useWorkload } from "../../../hooks/useInsights.js";
import { Meter, StatTile } from "./primitives.js";

interface DashboardsViewProps {
  projectId: string;
}

const STORY_STATUS_LABELS = [
  { key: "done", label: "Done", tone: "done" as const },
  { key: "active", label: "In progress", tone: "active" as const },
  { key: "ready", label: "Ready", tone: "ready" as const },
  { key: "draft", label: "Draft", tone: "draft" as const },
];

const SEVERITY_LABELS = [
  { key: "critical", label: "Critical", tone: "blocked" as const },
  { key: "high", label: "High", tone: "active" as const },
  { key: "medium", label: "Medium", tone: "ready" as const },
  { key: "low", label: "Low", tone: "draft" as const },
];

// IN-001 (progress) + IN-002 (quality) + IN-008 (workload), one combined
// "dashboards" surface — DESIGN-CHARTER §2's "Insights (progress · quality ·
// team · digests)" nav-map bullet, laid out as stacked cards matching
// ProductOverview's existing stat-tile treatment (no charting library — see
// ./primitives.tsx).
export function DashboardsView({ projectId }: DashboardsViewProps): JSX.Element {
  const { data: progress, isLoading: progressLoading } = useProgress(projectId);
  const { data: quality, isLoading: qualityLoading } = useQuality(projectId);
  const { data: workload, isLoading: workloadLoading } = useWorkload(projectId);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          {progressLoading || !progress ? (
            <p className="text-[13px] text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <StatTile
                  label="Requirements built"
                  value={`${progress.requirements.built} of ${progress.requirements.total}`}
                  hint={`${progress.requirements.verified} verified`}
                />
                <StatTile label="Builds in progress" value={progress.activeBuilds} />
                <StatTile label="Requirements pending" value={progress.requirements.pending} />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">Stories by status</span>
                {STORY_STATUS_LABELS.map(({ key, label, tone }) => {
                  const count = progress.stories[key as keyof typeof progress.stories];
                  const total =
                    progress.stories.draft + progress.stories.ready + progress.stories.active + progress.stories.done;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{label}</span>
                      <Meter value={count} max={Math.max(total, 1)} tone={tone} />
                      <span className="w-4 shrink-0 text-right text-[11px] tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </div>

              {progress.releases.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Releases</span>
                  {progress.releases.map((release) => (
                    <div key={release.id} className="flex items-center justify-between">
                      <span className="text-[13px]">{release.name}</span>
                      <StatusBadge status={release.status} />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quality</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          {qualityLoading || !quality ? (
            <p className="text-[13px] text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <StatTile label="Test coverage" value={`${Math.round(quality.coveragePercent)}%`} />
                <StatTile
                  label="Checks passing"
                  value={`${quality.checksPassing} of ${quality.checksTotal}`}
                />
                <StatTile
                  label="Test suites passing"
                  value={`${quality.suitesPassing} of ${quality.suitesTotal}`}
                  hint={
                    quality.flaggedUnreliable > 0
                      ? `${quality.flaggedUnreliable} flagged as unreliable`
                      : undefined
                  }
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">Open issues by severity</span>
                {SEVERITY_LABELS.map(({ key, label, tone }) => {
                  const count = quality.findingsBySeverity[key as keyof typeof quality.findingsBySeverity];
                  const max = Math.max(
                    quality.findingsBySeverity.critical,
                    quality.findingsBySeverity.high,
                    quality.findingsBySeverity.medium,
                    quality.findingsBySeverity.low,
                    1,
                  );
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
                      <Meter value={count} max={max} tone={tone} />
                      <span className="w-4 shrink-0 text-right text-[11px] tabular-nums">{count}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team workload</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5 pt-0">
          {workloadLoading || !workload ? (
            <p className="text-[13px] text-muted-foreground">Loading…</p>
          ) : workload.people.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No one has open work on this project yet.</p>
          ) : (
            (() => {
              const maxAssigned = Math.max(...workload.people.map((p) => p.assigned), 1);
              return workload.people.map((person) => (
                <div key={person.personId} className="flex items-center gap-2.5">
                  <span className="w-24 shrink-0 truncate text-[13px]">{person.personName}</span>
                  <Meter value={person.assigned} max={maxAssigned} className="flex-1" />
                  <span className="w-40 shrink-0 text-right text-[11px] text-muted-foreground">
                    {person.assigned} assigned · {person.pendingReview} to review · {person.pendingAcceptance}{" "}
                    to accept
                  </span>
                </div>
              ));
            })()
          )}
        </CardContent>
      </Card>
    </div>
  );
}
