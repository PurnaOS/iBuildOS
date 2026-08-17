import { describe, expect, it } from "vitest";
import { checkGuidanceStale } from "./guidance.js";

describe("guidance/stale", () => {
  it("green path: AGENTS.md exported after the last profile change", () => {
    const findings = checkGuidanceStale("AR-0001", "2026-08-16T00:00:00Z", "2026-08-01T00:00:00Z");
    expect(findings).toEqual([]);
  });

  it("red path: AGENTS.md exported before the profile last changed", () => {
    const findings = checkGuidanceStale("AR-0002", "2026-08-01T00:00:00Z", "2026-08-16T00:00:00Z");
    expect(findings).toEqual([
      expect.objectContaining({ rule: "guidance/stale", severity: "warn", artifact: "AR-0002" }),
    ]);
  });
});
