import { useState, type JSX } from "react";
import { CheckCircle2, Circle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { useAcceptance, useDecideAcceptance, useWaiveCriterion } from "../../hooks/useVerification.js";
import type { AcceptanceCriterion } from "../../../../shared/ipc/contract/verification.js";

interface AcceptanceChecklistViewProps {
  targetId: string;
}

// RV-003/RV-004: the story and its criteria as a checklist, each linked to
// its verifying test's live status, plus accept / request changes / reject
// -- no diff reading required. RV-004: a human waiver is valid evidence in
// place of a passing test.
export function AcceptanceChecklistView({ targetId }: AcceptanceChecklistViewProps): JSX.Element {
  const { data: checklist, isLoading } = useAcceptance(targetId);
  const decide = useDecideAcceptance(targetId);
  const waive = useWaiveCriterion(targetId);
  const [note, setNote] = useState("");
  const [waivingId, setWaivingId] = useState<string | null>(null);
  const [waiverReason, setWaiverReason] = useState("");
  const [decideError, setDecideError] = useState<string | null>(null);

  if (isLoading || !checklist) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acceptance</CardTitle>
        </CardHeader>
        <CardContent className="text-[13px] text-muted-foreground">Loading the checklist…</CardContent>
      </Card>
    );
  }

  const allResolved = checklist.criteria.every((c) => c.status === "verified" || c.status === "waived");

  function submitDecision(decision: "accepted" | "changes-requested" | "rejected"): void {
    setDecideError(null);
    decide.mutate(
      { decision, note: note.trim() ? note.trim() : undefined },
      { onError: (err) => setDecideError(err instanceof Error ? err.message : String(err)) },
    );
  }

  function confirmWaiver(criterionId: string): void {
    if (!waiverReason.trim()) return;
    waive.mutate(
      { criterionId, reason: waiverReason.trim() },
      { onSuccess: () => setWaivingId(null) },
    );
    setWaiverReason("");
  }

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Accept "{checklist.storyName}"</CardTitle>
          <DecisionBadge decision={checklist.decision} />
        </div>
        <CardDescription>{checklist.summary}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {checklist.criteria.map((criterion) => (
            <CriterionRow
              key={criterion.id}
              criterion={criterion}
              isWaiving={waivingId === criterion.id}
              onStartWaive={() => {
                setWaivingId(criterion.id);
                setWaiverReason("");
              }}
              onCancelWaive={() => setWaivingId(null)}
              waiverReason={waiverReason}
              onWaiverReasonChange={setWaiverReason}
              onConfirmWaive={() => confirmWaiver(criterion.id)}
              waiving={waive.isPending}
            />
          ))}
        </ul>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Notes for the team (optional)</span>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What should change, or why you're deciding this way"
          />
        </label>

        {decideError ? <p className="text-[13px] text-state-blocked">{decideError}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => submitDecision("accepted")}
            disabled={!allResolved || decide.isPending}
            title={allResolved ? undefined : "Every criterion needs a passing check or a waiver first"}
          >
            Accept story
          </Button>
          <Button size="sm" variant="outline" onClick={() => submitDecision("changes-requested")} disabled={decide.isPending}>
            Request changes
          </Button>
          <Button size="sm" variant="destructive" onClick={() => submitDecision("rejected")} disabled={decide.isPending}>
            Reject
          </Button>
        </div>

        {checklist.decision !== "pending" ? (
          <p className="text-[11px] text-muted-foreground">
            Decided by {checklist.decidedBy ?? "someone"}
            {checklist.note ? ` — "${checklist.note}"` : ""}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DecisionBadge({ decision }: { decision: string }): JSX.Element | null {
  if (decision === "pending") return null;
  const label =
    decision === "accepted" ? "Accepted" : decision === "changes-requested" ? "Changes requested" : "Rejected";
  return (
    <Badge>
      {decision === "accepted" ? <CheckCircle2 className="h-3 w-3 text-state-done" aria-hidden /> : null}
      {label}
    </Badge>
  );
}

function CriterionRow({
  criterion,
  isWaiving,
  onStartWaive,
  onCancelWaive,
  waiverReason,
  onWaiverReasonChange,
  onConfirmWaive,
  waiving,
}: {
  criterion: AcceptanceCriterion;
  isWaiving: boolean;
  onStartWaive: () => void;
  onCancelWaive: () => void;
  waiverReason: string;
  onWaiverReasonChange: (value: string) => void;
  onConfirmWaive: () => void;
  waiving: boolean;
}): JSX.Element {
  const Icon = criterion.status === "verified" ? CheckCircle2 : criterion.status === "waived" ? ShieldCheck : Circle;
  const label =
    criterion.status === "verified"
      ? "Verified"
      : criterion.status === "waived"
        ? `Waived — ${criterion.waiverReason ?? ""}`
        : "Waiting on a passing check";

  return (
    <li className="flex flex-col gap-1.5 rounded-md px-1.5 py-1.5">
      <div className="flex items-start gap-2.5">
        <Icon
          className={
            "mt-0.5 h-3.5 w-3.5 shrink-0 " +
            (criterion.status === "verified"
              ? "text-state-done"
              : criterion.status === "waived"
                ? "text-state-active"
                : "text-muted-foreground")
          }
          aria-hidden
        />
        <div className="flex flex-1 flex-col">
          <span className="text-[13px]">{criterion.description}</span>
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
        {criterion.status === "unverified" && !isWaiving ? (
          <Button size="sm" variant="ghost" onClick={onStartWaive}>
            Waive
          </Button>
        ) : null}
      </div>
      {isWaiving ? (
        <div className="ml-6 flex items-center gap-2">
          <Input
            autoFocus
            value={waiverReason}
            onChange={(e) => onWaiverReasonChange(e.target.value)}
            placeholder="Why is this OK to accept without a passing check?"
          />
          <Button size="sm" onClick={onConfirmWaive} disabled={!waiverReason.trim() || waiving}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelWaive}>
            Cancel
          </Button>
        </div>
      ) : null}
    </li>
  );
}
