import { describe, expect, it } from "vitest";
import { checkEvidenceStale, checkTestsPassing } from "./evidence.js";

describe("evid/tests-passing", () => {
  it("green path: a bound TestResult with verdict pass has no findings", () => {
    const findings = checkTestsPassing("ST-0001", () => ({ verdict: "pass", at: "2026-08-01T00:00:00Z" }));
    expect(findings).toEqual([]);
  });

  it("red path: no bound TestResult at all", () => {
    const findings = checkTestsPassing("ST-0002", () => undefined);
    expect(findings).toEqual([
      expect.objectContaining({ rule: "evid/tests-passing", severity: "warn", artifact: "ST-0002" }),
    ]);
  });

  it("red path: bound TestResult exists but did not pass", () => {
    const findings = checkTestsPassing("ST-0003", () => ({ verdict: "fail", at: "2026-08-01T00:00:00Z" }));
    expect(findings).toEqual([
      expect.objectContaining({ rule: "evid/tests-passing", severity: "warn" }),
    ]);
  });

  it("elevates to error under the `gates` context (RULE_REGISTRY override)", () => {
    const findings = checkTestsPassing("ST-0004", () => undefined, "gates");
    expect(findings).toEqual([
      expect.objectContaining({ rule: "evid/tests-passing", severity: "error" }),
    ]);
  });
});

describe("evid/stale", () => {
  it("green path: evidence within the policy's max age", () => {
    const findings = checkEvidenceStale(
      "ST-0001",
      "2026-08-16T00:00:00Z",
      "2026-08-16T02:00:00Z",
      { maxAgeMs: 3 * 60 * 60 * 1000 },
    );
    expect(findings).toEqual([]);
  });

  it("red path: evidence older than the policy allows", () => {
    const findings = checkEvidenceStale(
      "ST-0002",
      "2026-08-01T00:00:00Z",
      "2026-08-16T00:00:00Z",
      { maxAgeMs: 24 * 60 * 60 * 1000 },
    );
    expect(findings).toEqual([
      expect.objectContaining({ rule: "evid/stale", severity: "warn", artifact: "ST-0002" }),
    ]);
  });
});
