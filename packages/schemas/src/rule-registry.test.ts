import { describe, expect, it } from "vitest";
import { RULE_REGISTRY, resolveSeverity } from "./rule-registry.js";

describe("rule registry (FORMATS.md §6)", () => {
  it("resolves a flat-severity rule regardless of context", () => {
    expect(resolveSeverity("doc/field-required")).toBe("error");
    expect(resolveSeverity("doc/field-required", "merge")).toBe("error");
  });

  it("resolves a gate-qualified rule's override under that gate", () => {
    expect(resolveSeverity("chain/story-untested")).toBe("warn");
    expect(resolveSeverity("chain/story-untested", "merge")).toBe("error");
  });

  it("resolves the CI/UI-qualified pin rules", () => {
    expect(resolveSeverity("pin/engine", "ci")).toBe("error");
    expect(resolveSeverity("pin/engine", "ui")).toBe("warn");
    expect(resolveSeverity("pin/engine")).toBe("warn");
  });

  it("throws on an unknown rule id", () => {
    expect(() => resolveSeverity("made/up")).toThrow(/unknown rule id/);
  });

  it("every registry entry has a valid id shaped like area/name", () => {
    for (const id of Object.keys(RULE_REGISTRY)) {
      expect(id).toMatch(/^[a-z]+\/[a-z-]+$/);
    }
  });
});
