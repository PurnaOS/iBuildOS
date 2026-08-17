import { useState, type JSX } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../ui/button.js";
import { ModeSwitch } from "../layout/ModeSwitch.js";
import { Sidebar } from "../layout/Sidebar.js";
import { StubSection } from "./StubSection.js";
import { ProductOverview } from "./ProductOverview.js";
import { EngineeringOverview } from "./EngineeringOverview.js";
import { BuildSection } from "../builds/BuildSection.js";
import { useOpenProject } from "../../hooks/useProjects.js";
import type { Mode } from "../../lib/nav.js";

interface ProjectWindowProps {
  projectId: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onBack: () => void;
}

// DESIGN-CHARTER §2: "Project window: Mode switch: PRODUCT ⇄ ENGINEERING
// (⌘E) · Global: ⌘K palette · attention queue (⌘J) · chat panel (⌘L) ·
// PRODUCT/ENGINEERING mode sidebar." This scaffold renders it as a view
// within the single app window rather than a second OS-level window — a
// deliberate simplification for this milestone (see README.md's scope note);
// nothing about the IPC contract or component boundaries assumes otherwise.
export function ProjectWindow({ projectId, mode, onModeChange, onBack }: ProjectWindowProps): JSX.Element {
  const { data: project, isLoading } = useOpenProject(projectId);
  const [section, setSection] = useState("overview");

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to Home">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[13px] font-medium">{project?.name ?? "Loading…"}</span>
        </div>
        <ModeSwitch mode={mode} onChange={onModeChange} />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar mode={mode} activeId={section} onSelect={setSection} />
        <main className="flex-1 overflow-hidden">
          {isLoading || !project ? (
            <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
              Loading…
            </div>
          ) : section === "overview" ? (
            mode === "product" ? (
              <ProductOverview project={project} />
            ) : (
              <EngineeringOverview project={project} />
            )
          ) : section === "build" && mode === "product" ? (
            <BuildSection projectId={project.id} />
          ) : (
            <StubSection title={sectionTitle(section)} />
          )}
        </main>
      </div>
    </div>
  );
}

function sectionTitle(id: string): string {
  return id
    .split("-")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}
