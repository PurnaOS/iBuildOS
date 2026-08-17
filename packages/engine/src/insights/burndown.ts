import type { Baseline } from "@ibuildos/schemas";
import { checkShrinkOnly, type ShrinkOnlyResult } from "../baseline/baseline.js";

// IN-006 — debt & adoption burndown: baseline size over time, split by
// scope_events, built on `Baseline`'s own `entries`/`scope_events` shape
// (packages/engine/src/baseline) rather than inventing a new one.
//
// Callers supply the sequence of Baseline snapshots already in chronological
// order — one per commit (or per run) that touched `.ibuildos/baseline.json`.
// This module does no git work of its own and does not re-sort the input; a
// caller who passes a different order gets that order reflected back, not a
// silently "corrected" one.

export interface BurndownPoint {
  generated: string;
  entries: number;
  /** `entries - previous point's entries`; `0` for the first point (nothing
   * precedes it to diff against). */
  delta: number;
  /** `scope_events` appended since the previous point — empty for the first
   * point, or whenever nothing new was recorded between two points. */
  newScopeEvents: Baseline["scope_events"];
  /** `checkShrinkOnly(previous, this)` (baseline.ts) — `null` for the first
   * point, since there is no previous snapshot to ratchet against. */
  shrinkOnly: ShrinkOnlyResult | null;
}

export function burndown(baselines: readonly Baseline[]): BurndownPoint[] {
  return baselines.map((baseline, index) => {
    const previous = baselines[index - 1];
    if (!previous) {
      return {
        generated: baseline.generated,
        entries: baseline.entries.length,
        delta: 0,
        newScopeEvents: [],
        shrinkOnly: null,
      };
    }

    return {
      generated: baseline.generated,
      entries: baseline.entries.length,
      delta: baseline.entries.length - previous.entries.length,
      newScopeEvents: baseline.scope_events.slice(previous.scope_events.length),
      shrinkOnly: checkShrinkOnly(previous, baseline),
    };
  });
}
