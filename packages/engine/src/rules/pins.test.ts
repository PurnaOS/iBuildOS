import { describe, expect, it } from "vitest";
import { checkEnginePin, checkProfilePin, versionSatisfiesRange } from "./pins.js";

describe("pin/engine", () => {
  it("green path: evaluator version satisfies the recorded semver range", () => {
    const findings = checkEnginePin("PB-0001", ">=1.0.0 <2.0.0", "1.4.2");
    expect(findings).toEqual([]);
  });

  it("versionSatisfiesRange rejects a version outside the range", () => {
    expect(versionSatisfiesRange("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
    expect(versionSatisfiesRange("0.9.0", ">=1.0.0 <2.0.0")).toBe(false);
    expect(versionSatisfiesRange("1.9.9", ">=1.0.0 <2.0.0")).toBe(true);
  });

  it("red path: version-mismatch resolves to error under the `ci` context, warn under `ui`", () => {
    const ciFindings = checkEnginePin("PB-0002", ">=1.0.0 <2.0.0", "2.1.0", "ci");
    const uiFindings = checkEnginePin("PB-0002", ">=1.0.0 <2.0.0", "2.1.0", "ui");

    expect(ciFindings).toEqual([
      expect.objectContaining({ rule: "pin/engine", severity: "error", artifact: "PB-0002" }),
    ]);
    expect(uiFindings).toEqual([
      expect.objectContaining({ rule: "pin/engine", severity: "warn", artifact: "PB-0002" }),
    ]);
  });

  it("no context supplied falls back to the rule's flat default (warn)", () => {
    const findings = checkEnginePin("PB-0003", ">=1.0.0 <2.0.0", "2.1.0");
    expect(findings).toEqual([
      expect.objectContaining({ rule: "pin/engine", severity: "warn" }),
    ]);
  });
});

describe("pin/profile", () => {
  it("green path: exact version match", () => {
    expect(checkProfilePin("PB-0001", "1.0.0", "1.0.0")).toEqual([]);
  });

  it("red path: mismatch resolves to error under `ci`, warn under `ui`", () => {
    expect(checkProfilePin("PB-0002", "1.0.0", "1.1.0", "ci")).toEqual([
      expect.objectContaining({ rule: "pin/profile", severity: "error" }),
    ]);
    expect(checkProfilePin("PB-0002", "1.0.0", "1.1.0", "ui")).toEqual([
      expect.objectContaining({ rule: "pin/profile", severity: "warn" }),
    ]);
  });
});
