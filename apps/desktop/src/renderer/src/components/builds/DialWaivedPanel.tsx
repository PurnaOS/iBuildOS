import type { JSX } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Button } from "../ui/button.js";
import { useDialWaived, useMarkDialWaivedReviewed } from "../../hooks/useBuilds.js";
import { DIAL_WAIVED_KIND_LABEL } from "../../lib/buildCopy.js";

interface DialWaivedPanelProps {
  projectId: string;
}

/** D-115: "auto waives the acceptance and merge stops ... each waiver
 * recorded as dial-waived and queued for after-the-fact review." This is
 * that queue — only ever populated while the autonomy dial is `auto`. */
export function DialWaivedPanel({ projectId }: DialWaivedPanelProps): JSX.Element | null {
  const { data: items } = useDialWaived(projectId);
  const markReviewed = useMarkDialWaivedReviewed(projectId);

  const pending = (items ?? []).filter((item) => !item.reviewed);
  if (pending.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Done automatically while you were away</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 pt-0">
        {pending.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1">
            <span className="text-[13px]">
              {item.storyName} — {DIAL_WAIVED_KIND_LABEL[item.kind]}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={markReviewed.isPending}
              onClick={() => markReviewed.mutate(item.id)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Mark reviewed
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
