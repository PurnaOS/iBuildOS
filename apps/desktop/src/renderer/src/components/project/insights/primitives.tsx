import type { JSX } from "react";
import { cn } from "../../../lib/cn.js";

interface MeterProps {
  value: number;
  max: number;
  tone?: "accent" | "done" | "active" | "blocked" | "ready" | "draft";
  className?: string;
}

const TONE_CLASS: Record<NonNullable<MeterProps["tone"]>, string> = {
  accent: "bg-accent",
  done: "bg-state-done",
  active: "bg-state-active",
  blocked: "bg-state-blocked",
  ready: "bg-state-ready",
  draft: "bg-state-draft",
};

/** A thin, rounded-end magnitude bar — the dataviz skill's mark spec for a
 * single-hue magnitude series, built with a plain sized div rather than a
 * charting library (this round's brief: "plain numbers/bars are enough").
 * Always paired with a numeric label by its caller — DESIGN-CHARTER §1's
 * "state is never color-alone" applies here too. */
export function Meter({ value, max, tone = "accent", className }: MeterProps): JSX.Element {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-150 ease-out", TONE_CLASS[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string | undefined;
}

/** A hero-number stat tile (dataviz skill: "is it even a chart? — a single
 * number is sometimes the right form"), styled to match ProductOverview's
 * existing "Builds in progress" / "Waiting on you" tiles. */
export function StatTile({ label, value, hint }: StatTileProps): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[20px] font-medium leading-none">{value}</span>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
