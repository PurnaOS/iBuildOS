import { type JSX, useState } from "react";
import { Bell, Plus, Search } from "lucide-react";
import { Button } from "../ui/button.js";
import { useProjects } from "../../hooks/useProjects.js";
import { useAttentionQueue } from "../../hooks/useActivity.js";
import { useUiStore } from "../../state/ui-store.js";
import { ProjectCard } from "./ProjectCard.js";
import { CreateProjectDialog } from "./CreateProjectDialog.js";

interface HomeScreenProps {
  onOpenProject: (id: string) => void;
}

// DESIGN-CHARTER §2: "Home (project grid + global attention count)."
export function HomeScreen({ onOpenProject }: HomeScreenProps): JSX.Element {
  const { data: projects, isLoading } = useProjects();
  const attentionItems = useAttentionQueue();
  const setAttentionOpen = useUiStore((s) => s.setAttentionOpen);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h1 className="text-[13px] font-medium">iBuildOS</h1>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={() => setPaletteOpen(true)} aria-label="Search (⌘K)">
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAttentionOpen(true)}
            aria-label={`Attention queue (${attentionItems.length})`}
            className="relative"
          >
            <Bell className="h-3.5 w-3.5" />
            {attentionItems.length > 0 ? (
              <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-state-blocked px-0.5 text-[9px] font-medium text-white">
                {attentionItems.length}
              </span>
            ) : null}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New project
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <p className="text-[13px] text-muted-foreground">Loading projects…</p>
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} onOpen={onOpenProject} />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-[13px] text-muted-foreground">No projects yet.</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create your first project
            </Button>
          </div>
        )}
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={onOpenProject} />
    </div>
  );
}
