import { useState, type JSX } from "react";
import { BuildListView } from "./BuildListView.js";
import { BuildDetailView } from "./BuildDetailView.js";
import { useStreamEvents } from "../../hooks/useBuilds.js";

interface BuildSectionProps {
  projectId: string;
}

/** DESIGN-CHARTER §2: Product sidebar "Build (streams grid → stream watch →
 * acceptance)" — list and detail live here, toggled by local selection state
 * the same way ../project/ProjectWindow.tsx toggles its own `section`. The
 * acceptance screen (RV area) is a different work package's scope.
 *
 * useStreamEvents is called here, not inside BuildListView/BuildDetailView —
 * this component shows list *or* detail, never both, so a subscription
 * owned by either child would tear down the moment the other one mounts.
 * Owning it here keeps BD-010's live updates flowing across both. */
export function BuildSection({ projectId }: BuildSectionProps): JSX.Element {
  useStreamEvents(projectId);
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
