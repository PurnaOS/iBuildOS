import {
  Activity,
  Boxes,
  ClipboardList,
  Compass,
  FlaskConical,
  GitMerge,
  Layers,
  LayoutGrid,
  LineChart,
  ListChecks,
  MessagesSquare,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export type Mode = "product" | "engineering";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

// DESIGN-CHARTER.md §2's navigation map, one item per sidebar row. Labels are
// already plain-language per §4's vocabulary glossary — Product mode never
// needs a second pass to strip git/engineering jargon because none was
// written here to begin with.
export const PRODUCT_NAV: readonly NavItem[] = [
  { id: "overview", label: "Overview", icon: Compass },
  { id: "requirements", label: "Requirements", icon: ClipboardList },
  { id: "plan", label: "Plan", icon: ListChecks },
  { id: "build", label: "Build", icon: Sparkles },
  { id: "changes", label: "Changes", icon: Waypoints },
  { id: "quality", label: "Quality", icon: FlaskConical },
  { id: "releases", label: "Releases", icon: Rocket },
  { id: "insights", label: "Insights", icon: LineChart },
];

export const ENGINEERING_NAV: readonly NavItem[] = [
  { id: "overview", label: "Overview", icon: Compass },
  { id: "artifacts", label: "Artifacts", icon: Boxes },
  { id: "trace", label: "Trace", icon: Waypoints },
  { id: "streams", label: "Streams", icon: Layers },
  { id: "merge-queue", label: "Merge queue", icon: GitMerge },
  { id: "reviews", label: "Reviews", icon: MessagesSquare },
  { id: "runs", label: "Runs", icon: Activity },
  { id: "problems", label: "Problems", icon: ShieldCheck },
  { id: "profile", label: "Profile", icon: LayoutGrid },
  { id: "contract", label: "Contract", icon: ClipboardList },
  { id: "system", label: "System", icon: Settings2 },
];
