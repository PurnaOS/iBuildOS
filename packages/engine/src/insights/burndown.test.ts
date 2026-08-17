import { describe, expect, it } from "vitest";
import type { Baseline } from "@ibuildos/schemas";
import { burndown } from "./burndown.js";

function baseline(overrides: Partial<Baseline> & Pick<Baseline, "generated">): Baseline {
  return {
    formats: 1,
    engine: "1.0.0",
    profile: "ibuildos-default@1.0.0",
    scope_events: [],
    entries: [],
    ...overrides,
  };
}

describe("burndown", () => {
  it("returns [] for an empty sequence", () => {
    expect(burndown([])).toEqual([]);
  });

  it("a single snapshot has delta 0 and no comparison point", () => {
    const only = baseline({ generated: "2026-08-14T10:00:00Z", entries: [{ rule: "r", artifact: "A", fp: "1" }] });

    expect(burndown([only])).toEqual([
      { generated: "2026-08-14T10:00:00Z", entries: 1, delta: 0, newScopeEvents: [], shrinkOnly: null },
    ]);
  });

  it("tracks a shrinking sequence (debt paid down) with negative deltas and ok shrinkOnly", () => {
    const points: Baseline[] = [
      baseline({
        generated: "2026-08-14T10:00:00Z",
        entries: [
          { rule: "r", artifact: "A", fp: "1" },
          { rule: "r", artifact: "B", fp: "2" },
          { rule: "r", artifact: "C", fp: "3" },
        ],
      }),
      baseline({
        generated: "2026-08-15T10:00:00Z",
        entries: [
          { rule: "r", artifact: "A", fp: "1" },
          { rule: "r", artifact: "B", fp: "2" },
        ],
      }),
      baseline({
        generated: "2026-08-16T10:00:00Z",
        entries: [{ rule: "r", artifact: "A", fp: "1" }],
      }),
    ];

    const result = burndown(points);

    expect(result.map((p) => p.entries)).toEqual([3, 2, 1]);
    expect(result.map((p) => p.delta)).toEqual([0, -1, -1]);
    expect(result[1]!.shrinkOnly).toEqual({ ok: true, violations: [] });
    expect(result[2]!.shrinkOnly).toEqual({ ok: true, violations: [] });
  });

  it("flags a mid-sequence scope-expansion event: growth is scope-justified, not a violation", () => {
    const before = baseline({
      generated: "2026-08-14T10:00:00Z",
      entries: [{ rule: "r", artifact: "A", fp: "1" }],
    });
    const expanded = baseline({
      generated: "2026-08-15T10:00:00Z",
      scope_events: [{ at: "2026-08-15", added_paths: ["src/legacy/**"], entries: 5 }],
      entries: [
        { rule: "r", artifact: "A", fp: "1" },
        { rule: "r", artifact: "B", fp: "2" },
      ],
    });

    const result = burndown([before, expanded]);

    expect(result[0]!.newScopeEvents).toEqual([]);
    expect(result[1]!.newScopeEvents).toEqual([{ at: "2026-08-15", added_paths: ["src/legacy/**"], entries: 5 }]);
    expect(result[1]!.delta).toBe(1);
    expect(result[1]!.shrinkOnly).toEqual({ ok: true, violations: [] });
  });

  it("flags unscoped growth (no new scope event) as a shrinkOnly violation", () => {
    const before = baseline({
      generated: "2026-08-14T10:00:00Z",
      entries: [{ rule: "r", artifact: "A", fp: "1" }],
    });
    const grown = baseline({
      generated: "2026-08-15T10:00:00Z",
      entries: [
        { rule: "r", artifact: "A", fp: "1" },
        { rule: "r", artifact: "B", fp: "2" },
      ],
    });

    const result = burndown([before, grown]);

    expect(result[1]!.shrinkOnly).toEqual({
      ok: false,
      violations: [{ rule: "r", artifact: "B", fp: "2" }],
    });
  });

  it("does not re-sort — respects whatever order the caller supplies", () => {
    const early = baseline({ generated: "2026-08-14T10:00:00Z", entries: [{ rule: "r", artifact: "A", fp: "1" }] });
    const late = baseline({
      generated: "2026-08-16T10:00:00Z",
      entries: [
        { rule: "r", artifact: "A", fp: "1" },
        { rule: "r", artifact: "B", fp: "2" },
      ],
    });

    // Deliberately out of chronological order.
    const result = burndown([late, early]);

    expect(result.map((p) => p.generated)).toEqual(["2026-08-16T10:00:00Z", "2026-08-14T10:00:00Z"]);
    expect(result[1]!.delta).toBe(-1);
  });
});
