import type { JSX } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import type { Project } from "../../../../shared/domain.js";

interface EngineeringOverviewProps {
  project: Project;
}

// DESIGN-CHARTER §2: "Overview (gates, trunk state, merge queue)." Engineering
// mode uses precise git/engineering terms freely (§4) — this stub previews
// what M3+ (packages/engine wired to the desktop shell) fills in for real.
export function EngineeringOverview({ project }: EngineeringOverviewProps): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div>
        <h2 className="text-[13px] font-medium">{project.name}</h2>
        <p className="text-[11px] text-muted-foreground">Engineering overview</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Trunk state</CardTitle>
        </CardHeader>
        <CardContent className="text-[13px] text-muted-foreground">
          No engine connected yet — this scaffold has no worktrees, gates, or merge queue to
          report on. Wiring packages/engine into apps/desktop is later milestone work.
        </CardContent>
      </Card>
    </div>
  );
}
