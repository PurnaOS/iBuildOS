import { type JSX, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "../ui/dialog.js";
import { cn } from "../../lib/cn.js";
import { useProjects } from "../../hooks/useProjects.js";
import { useUiStore } from "../../state/ui-store.js";

interface PaletteAction {
  id: string;
  label: string;
  hint?: string | undefined;
  run: () => void;
}

interface CommandPaletteProps {
  onGoHome: () => void;
  onOpenProject: (id: string) => void;
}

// PS-010: "A global palette shall reach every screen, entity, and action."
// This scaffold wires two entity kinds (Home, Projects) — enough surface to
// prove the pattern; more entity types register the same way as they land.
export function CommandPalette({ onGoHome, onOpenProject }: CommandPaletteProps): JSX.Element {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const { data: projects } = useProjects();
  const [query, setQuery] = useState("");

  const actions = useMemo<PaletteAction[]>(() => {
    const base: PaletteAction[] = [
      { id: "go-home", label: "Go to Home", run: onGoHome },
      ...(projects ?? []).map((project) => ({
        id: `open-${project.id}`,
        label: `Open ${project.name}`,
        hint: project.template,
        run: () => onOpenProject(project.id),
      })),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((action) => action.label.toLowerCase().includes(q));
  }, [projects, query, onGoHome, onOpenProject]);

  function runAndClose(action: PaletteAction): void {
    action.run();
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent showClose={false} className="top-[20%] max-w-md translate-y-0 p-0">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects and actions…"
            aria-label="Command palette search"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul role="listbox" aria-label="Results" className="max-h-72 overflow-auto p-1">
          {actions.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              No matches
            </li>
          ) : (
            actions.map((action) => (
              <li key={action.id}>
                <button
                  type="button"
                  onClick={() => runAndClose(action)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px]",
                    "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                  )}
                >
                  <span>{action.label}</span>
                  {action.hint ? (
                    <span className="text-[11px] text-muted-foreground">{action.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
