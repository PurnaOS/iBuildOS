import type { JSX } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card.js";
import { useAdoptionProgress } from "../../../hooks/useInsights.js";
import { formatRelativeTime } from "../../../lib/relativeTime.js";
import { StatTile } from "./primitives.js";

interface AdoptionViewProps {
  projectId: string;
}

// IN-006 / BF-006: "baseline size over time, adopted-scope coverage,
// backfill completeness — the brownfield health view." A project built from
// scratch has nothing to show here (BF-006 only applies to a project that
// went through the adoption flow) — an empty state explains why rather than
// rendering a chart of zeros.
export function AdoptionView({ projectId }: AdoptionViewProps): JSX.Element {
  const { data, isLoading } = useAdoptionProgress(projectId);

  if (isLoading || !data) {
    return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  }

  if (!data.isAdopted) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-[13px] font-medium">No adoption history here</p>
          <p className="max-w-xs text-[13px] text-muted-foreground">
            This project was built from scratch, so there's no starting debt to track.
          </p>
        </CardContent>
      </Card>
    );
  }

  const peak = Math.max(...data.burndown.map((p) => p.remaining), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adoption progress</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-0">
        <div className="grid grid-cols-3 gap-4">
          <StatTile label="Remaining" value={`${data.remaining} of ${data.baselineTotal}`} />
          <StatTile label="Adopted scope" value={`${Math.round(data.adoptedScopePercent)}%`} />
          <StatTile label="Backfill complete" value={`${Math.round(data.backfillCompletePercent)}%`} />
        </div>

        {data.burndown.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-muted-foreground">Starting debt burning down over time</span>
            <div
              className="flex h-16 items-end gap-1"
              role="img"
              aria-label={`Starting debt burndown, from ${data.burndown[0]!.remaining} items to ${
                data.burndown.at(-1)!.remaining
              } items remaining, over ${data.burndown.length} weeks`}
            >
              {data.burndown.map((point, i) => (
                <div
                  key={point.date}
                  className="min-w-[6px] flex-1 rounded-t-sm bg-accent"
                  style={{ height: `${Math.max((point.remaining / peak) * 100, 4)}%` }}
                  title={`${point.remaining} remaining — ${formatRelativeTime(point.date)}`}
                  aria-hidden={i !== 0 && i !== data.burndown.length - 1}
                />
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>
                {data.burndown[0]!.remaining} remaining · {formatRelativeTime(data.burndown[0]!.date)}
              </span>
              <span>
                {data.burndown.at(-1)!.remaining} remaining · {formatRelativeTime(data.burndown.at(-1)!.date)}
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
