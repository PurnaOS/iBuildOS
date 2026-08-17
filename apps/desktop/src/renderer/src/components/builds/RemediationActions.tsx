import { useState, type JSX } from "react";
import { AlertCircle, RotateCcw, Send, Square } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { REMEDIATION_ACTION_LABEL } from "../../lib/buildCopy.js";

interface RemediationActionsProps {
  reason: string | undefined;
  onRetry: () => void;
  onSteer: (instruction: string) => void;
  onAbort: () => void;
  isBusy?: boolean | undefined;
}

/** BD-013: "offer one-click remediation paths (retry task, send instruction,
 * open in Engineering mode, abort), and never silently discard work." "Open
 * in Engineering mode" is a navigation action (the mode switch in the
 * project window header), not a call this component makes. */
export function RemediationActions({
  reason,
  onRetry,
  onSteer,
  onAbort,
  isBusy,
}: RemediationActionsProps): JSX.Element {
  const [steering, setSteering] = useState(false);
  const [instruction, setInstruction] = useState("");

  return (
    <Card className="border-state-blocked">
      <CardHeader className="flex-row items-start gap-2 space-y-0">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-blocked" aria-hidden />
        <div className="flex flex-col gap-1">
          <CardTitle>This build needs attention</CardTitle>
          {reason ? <p className="text-[13px] text-muted-foreground">{reason}</p> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {steering ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = instruction.trim();
              if (!trimmed) return;
              onSteer(trimmed);
              setInstruction("");
              setSteering(false);
            }}
          >
            <Input
              autoFocus
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="What should change before it tries again?"
              aria-label="Instruction"
              disabled={isBusy}
            />
            <Button type="submit" size="sm" disabled={isBusy || instruction.trim().length === 0}>
              {REMEDIATION_ACTION_LABEL.steer}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSteering(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {REMEDIATION_ACTION_LABEL.retry}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => setSteering(true)}
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              {REMEDIATION_ACTION_LABEL.steer}
            </Button>
            <Button type="button" size="sm" variant="destructive" disabled={isBusy} onClick={onAbort}>
              <Square className="h-3.5 w-3.5" aria-hidden />
              {REMEDIATION_ACTION_LABEL.abort}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
