import type { JSX } from "react";
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { usePreview, useRefreshPreview } from "../../hooks/useVerification.js";
import { relativeTimeFrom } from "./relativeTime.js";
import type { PreviewDataState } from "../../../../shared/ipc/contract/verification.js";

interface PreviewPaneProps {
  targetId: string;
}

const DATA_STATE_LABEL: Record<PreviewDataState, string> = {
  seeded: "Fresh sample data",
  migrated: "Data updated for this change",
  stale: "Data may be out of date",
};

// PV-001..PV-004/PV-009, RV-003's primary acceptance artifact: the live
// preview, its freshness, and what it's actually running against, so nobody
// accepts against a stale build (PV-003) or stale data (PV-009).
export function PreviewPane({ targetId }: PreviewPaneProps): JSX.Element {
  const { data: preview, isLoading } = usePreview(targetId);
  const refresh = useRefreshPreview(targetId);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Live preview</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending || isLoading}
        >
          {refresh.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading || !preview ? (
          <p className="text-[13px] text-muted-foreground">Loading the preview…</p>
        ) : (
          <>
            <div
              className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted text-center"
              role="img"
              aria-label={`Preview of ${preview.versionLabel}`}
            >
              <ExternalLink className="h-5 w-5 text-muted-foreground" aria-hidden />
              <span className="text-[13px] text-muted-foreground">{preview.versionLabel}</span>
              {preview.url ? (
                <span className="font-mono text-[11px] text-muted-foreground">{preview.url}</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>
                <span className="text-muted-foreground">Updated</span>
                {relativeTimeFrom(preview.lastUpdatedAt)}
              </Badge>
              <Badge>
                {preview.dataState === "stale" ? (
                  <AlertCircle className="h-3 w-3 text-state-blocked" aria-hidden />
                ) : null}
                {DATA_STATE_LABEL[preview.dataState]}
              </Badge>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
