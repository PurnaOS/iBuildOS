import type { JSX } from "react";
import { CheckCircle2, HelpCircle, ListChecks, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.js";
import { useAttentionQueue } from "../../hooks/useActivity.js";
import { useUiStore } from "../../state/ui-store.js";
import type { ActivityEvent } from "../../../../shared/domain.js";

interface AttentionQueueProps {
  projectId?: string | undefined;
  onOpenProject: (id: string) => void;
}

const KIND_ICON: Record<ActivityEvent["kind"], typeof MessageSquare> = {
  note: MessageSquare,
  question: HelpCircle,
  approval: CheckCircle2,
  check: ListChecks,
};

// PS-009: "The app shall aggregate everything awaiting the current user
// (approvals, acceptances, questions from agents, review requests, red
// gates) into one attention queue." "Red gates" is engineering vocabulary —
// this surface only ever shows the Product-mode message text.
export function AttentionQueue({ projectId, onOpenProject }: AttentionQueueProps): JSX.Element {
  const open = useUiStore((s) => s.attentionOpen);
  const setOpen = useUiStore((s) => s.setAttentionOpen);
  const items = useAttentionQueue({ projectId });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md translate-y-[-45%] p-0">
        <DialogHeader>
          <DialogTitle>Needs your attention</DialogTitle>
          <DialogDescription>
            {items.length === 0
              ? "Nothing is waiting on you right now."
              : `${items.length} item${items.length === 1 ? "" : "s"} waiting on you.`}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 overflow-auto p-1">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onOpenProject(item.projectId);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left hover:bg-muted"
                >
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-blocked" aria-hidden />
                  <span className="flex flex-col">
                    <span className="text-[13px]">{item.message}</span>
                    <span className="text-[11px] text-muted-foreground">{item.projectName}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
