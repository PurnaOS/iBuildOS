import { useState, type JSX } from "react";
import { cn } from "../../lib/cn.js";
import { PreviewPane } from "./PreviewPane.js";
import { TestResultsView } from "./TestResultsView.js";
import { AcceptanceChecklistView } from "./AcceptanceChecklistView.js";
import { FinishAndCombine } from "./FinishAndCombine.js";
import { useVerificationUpdates } from "../../hooks/useVerification.js";
import { DEMO_TARGET_IDS } from "../../../../shared/ipc/contract/verification.js";

// Product-facing labels for the demo targets -- display copy naturally lives
// with the renderer, same as e.g. ../project/ProductOverview.tsx's own
// KIND_ICON map for a shared ActivityEvent shape.
const TARGET_LABELS: Record<string, string> = {
  "demo-story-offline-sync": "Offline sync",
  "demo-story-legacy-import": "Legacy data import",
};

function labelFor(targetId: string): string {
  return TARGET_LABELS[targetId] ?? targetId;
}

// DESIGN-CHARTER §2's nav map puts "coverage · suites · manual runs" under
// Product mode's Quality section; this work package's scope (previews/
// tests/acceptance/merge, not the streams grid that also flows into
// acceptance per the nav map's "Build" entry) mounts here rather than
// inside Build, which the sibling "streams" work package owns -- see
// ../project/ProjectWindow.tsx's comment at the "quality" branch.
export function VerificationSection(): JSX.Element {
  const [targetId, setTargetId] = useState<string>(DEMO_TARGET_IDS[0]);
  useVerificationUpdates(targetId);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Story</span>
        <div className="flex gap-1" role="tablist" aria-label="Story to review">
          {DEMO_TARGET_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === targetId}
              onClick={() => setTargetId(id)}
              className={cn(
                "rounded-md border border-border px-2.5 py-1 text-[13px] transition-colors duration-150 ease-out",
                id === targetId
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {labelFor(id)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PreviewPane targetId={targetId} />
        <TestResultsView targetId={targetId} />
      </div>
      <AcceptanceChecklistView targetId={targetId} />
      <FinishAndCombine targetId={targetId} />
    </div>
  );
}
