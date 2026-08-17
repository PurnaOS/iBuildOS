import type { JSX } from "react";
import { CheckCircle2, ClipboardList, HelpCircle, MessagesSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card.js";
import { useMyQueue } from "../../../hooks/useInsights.js";
import { formatRelativeTime } from "../../../lib/relativeTime.js";
import type { QueueItemKind } from "../../../../../shared/ipc/contract/insights.js";

interface MyQueueViewProps {
  projectId: string;
}

const KIND_META: Record<QueueItemKind, { label: string; icon: typeof CheckCircle2 }> = {
  assignment: { label: "Assigned to you", icon: ClipboardList },
  review: { label: "Waiting on your review", icon: MessagesSquare },
  acceptance: { label: "Ready to accept", icon: CheckCircle2 },
  "follow-up": { label: "Follow-up for you", icon: HelpCircle },
};

// TM-004: "Each user shall have a personal queue — assigned work, requested
// reviews/acceptances, answered-question follow-ups, owned bugs — derived
// from artifacts + current git identity." Scoped to the project window it's
// opened from (see ../../../../shared/ipc/contract/insights.ts's header
// comment on that scope call).
export function MyQueueView({ projectId }: MyQueueViewProps): JSX.Element {
  const { data, isLoading } = useMyQueue(projectId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>My queue{data ? ` — ${data.personName}` : ""}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5 pt-0">
        {isLoading || !data ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : data.items.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            Nothing is waiting on you right now.
          </p>
        ) : (
          data.items.map((item) => {
            const meta = KIND_META[item.kind];
            const Icon = meta.icon;
            return (
              <div key={item.id} className="flex items-start gap-2.5 rounded-md px-1.5 py-2">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium">{item.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTime(item.waitingSince)}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {meta.label} — {item.context}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
