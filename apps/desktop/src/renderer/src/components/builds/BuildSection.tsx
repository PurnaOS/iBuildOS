import { useState, type JSX } from "react";
import { BuildListView } from "./BuildListView.js";
import { BuildDetailView } from "./BuildDetailView.js";

interface BuildSectionProps {
  projectId: string;
}

/** DESIGN-CHARTER §2: Product sidebar "Build (streams grid → stream watch →
 * acceptance)" — list and detail live here, toggled by local selection state
 * the same way ../project/ProjectWindow.tsx toggles its own `section`. The
 * acceptance screen (RV area) is a different work package's scope. */
export function BuildSection({ projectId }: BuildSectionProps): JSX.Element {
  const [selectedBuildId, setSelectedBuildId] = useState<string | undefined>(undefined);

  if (selectedBuildId) {
    return (
      <BuildDetailView
        projectId={projectId}
        buildId={selectedBuildId}
        onBack={() => setSelectedBuildId(undefined)}
      />
    );
  }

  return <BuildListView projectId={projectId} onOpenBuild={setSelectedBuildId} />;
}
