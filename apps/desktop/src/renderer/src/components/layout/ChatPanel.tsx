import type { JSX } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog.js";
import { useUiStore } from "../../state/ui-store.js";

// DESIGN-CHARTER §2: "chat panel (⌘L, context-aware)." The real assistant
// surface arrives with ACP + CopilotKit/AG-UI (T-004/T-005, M3+) — out of
// scope for this scaffold, which only wires the panel's open/close skeleton
// so ⌘L already does something sensible.
export function ChatPanel(): JSX.Element {
  const open = useUiStore((s) => s.chatOpen);
  const setOpen = useUiStore((s) => s.setChatOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm translate-y-[-45%] p-0">
        <DialogHeader>
          <DialogTitle>Assistant</DialogTitle>
          <DialogDescription>
            Connect an assistant to talk through requirements, plans, and builds here.
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 text-[13px] text-muted-foreground">
          Not connected yet. Open Settings to connect an assistant.
        </div>
      </DialogContent>
    </Dialog>
  );
}
