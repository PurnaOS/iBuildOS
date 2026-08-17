import { useState, type JSX } from "react";
import { cn } from "../../../lib/cn.js";
import { DashboardsView } from "./DashboardsView.js";
import { AdoptionView } from "./AdoptionView.js";
import { MyQueueView } from "./MyQueueView.js";
import { TeamNotesView } from "./TeamNotesView.js";

interface InsightsSectionProps {
  projectId: string;
}

const TABS = [
  { id: "dashboards", label: "Dashboards" },
  { id: "adoption", label: "Adoption" },
  { id: "my-queue", label: "My queue" },
  { id: "team-notes", label: "Team notes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// DESIGN-CHARTER §2's nav map: "Insights (progress · quality · team ·
// digests)." This scaffold's read on that bullet: one Insights screen with
// internal sub-navigation covering IN-001/002/008's dashboards, IN-006/BF-006's
// adoption burndown, TM-004's my queue, and TM-009's (light) team notes — the
// charter's decree accepts this composition without a separate sign-off.
export function InsightsSection({ projectId }: InsightsSectionProps): JSX.Element {
  const [tab, setTab] = useState<TabId>("dashboards");

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div
        role="tablist"
        aria-label="Insights"
        className="inline-flex w-fit items-center rounded-md border border-border p-0.5 text-[13px]"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-[5px] px-2.5 py-1 transition-colors duration-150 ease-out",
              tab === t.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboards" ? (
        <DashboardsView projectId={projectId} />
      ) : tab === "adoption" ? (
        <AdoptionView projectId={projectId} />
      ) : tab === "my-queue" ? (
        <MyQueueView projectId={projectId} />
      ) : (
        <TeamNotesView projectId={projectId} />
      )}
    </div>
  );
}
