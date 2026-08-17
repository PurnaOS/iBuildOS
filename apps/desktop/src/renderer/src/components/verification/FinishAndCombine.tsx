import type { JSX } from "react";
import { AlertTriangle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { useAcceptance, useFinishAndCombine, useMergeResult } from "../../hooks/useVerification.js";
import type { MergeStatus } from "../../../../shared/ipc/contract/verification.js";

interface FinishAndCombineProps {
  targetId: string;
}

const STATUS_ICON: Record<MergeStatus, typeof CheckCircle2> = {
  idle: Circle,
  combining: Loader2,
  combined: CheckCircle2,
  "needs-attention": AlertTriangle,
};

// IG-003 in Product-mode vocabulary (DESIGN-CHARTER §4: never "merge"/"merge
// conflict"): once a story is accepted, one action lands it in the live
// product. A conflict-free, green landing just happens; a conflict surfaces
// as "these changes need reconciling," with a retry once that's sorted out.
export function FinishAndCombine({ targetId }: FinishAndCombineProps): JSX.Element {
  const { data: checklist } = useAcceptance(targetId);
  const { data: result, isLoading } = useMergeResult(targetId);
  const finish = useFinishAndCombine(targetId);

  const accepted = checklist?.decision === "accepted";
  // Acceptance can be satisfied and then drift (a re-run turns a
  // previously-passing check red) -- the backend re-checks this at
  // combine time too (see finishAndCombine's own gate), so mirror it here
  // rather than only surfacing it as a caught error after a click.
  const hasUnverified = checklist?.criteria.some((c) => c.status === "unverified") ?? false;
  const canCombine = accepted && !hasUnverified;
  const busy = finish.isPending || result?.status === "combining";
  const Icon = result ? STATUS_ICON[result.status] : Circle;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish &amp; combine</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading || !result ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex items-start gap-2.5">
            <Icon
              className={
                "mt-0.5 h-4 w-4 shrink-0 " +
                (result.status === "combined"
                  ? "text-state-done"
                  : result.status === "needs-attention"
                    ? "text-state-blocked"
                    : result.status === "combining"
                      ? "animate-spin text-state-active"
                      : "text-muted-foreground")
              }
              aria-hidden
            />
            <div className="flex flex-col gap-1">
              <span className="text-[13px]">{result.message}</span>
              {result.status === "needs-attention" ? (
                <Badge>Needs attention</Badge>
              ) : null}
            </div>
          </div>
        )}

        {finish.isError ? (
          <p className="text-[13px] text-state-blocked">
            {finish.error instanceof Error ? finish.error.message : String(finish.error)}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => finish.mutate()}
            disabled={!canCombine || busy}
            title={
              !accepted
                ? "Accept the story before combining it with the live product"
                : hasUnverified
                  ? "A check needs to pass (or be waived) again before combining"
                  : undefined
            }
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {result?.status === "needs-attention" ? "Try again" : "Finish & combine"}
          </Button>
          {!accepted ? (
            <span className="text-[11px] text-muted-foreground">Accept the story first.</span>
          ) : hasUnverified ? (
            <span className="text-[11px] text-muted-foreground">A check needs attention again.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
