import { describe, expect, it } from "vitest";
import { generateAdoptionGuide } from "./adoption-guide.js";

describe("generateAdoptionGuide", () => {
  it("includes the project name, in-scope areas, and baseline summary", () => {
    const guide = generateAdoptionGuide({
      projectName: "Acme Field Ops",
      scopeAreas: ["src/legacy/**", "docs/requirements/**"],
      baseline: { entries: 214, errors: 12, warnings: 150, info: 52 },
      generatedAt: "2026-08-16",
    });

    expect(guide).toContain("Acme Field Ops");
    expect(guide).toContain("src/legacy/**");
    expect(guide).toContain("docs/requirements/**");
    expect(guide).toContain("214");
    expect(guide).toContain("12 error(s), 150 warning(s), 52 info");
    expect(guide).toContain("2026-08-16");
  });

  it("covers BF-009's four required topics: what/why, gate expectations, baseline, rollout", () => {
    const guide = generateAdoptionGuide({
      projectName: "Acme Field Ops",
      scopeAreas: ["src/legacy/**"],
      baseline: { entries: 5 },
    });

    expect(guide).toMatch(/what.{0,20}changing/i);
    expect(guide).toMatch(/gate/i);
    expect(guide).toMatch(/baseline/i);
    expect(guide).toMatch(/rollout/i);
  });

  it("handles an empty scope-areas list without crashing (adoption not yet started)", () => {
    const guide = generateAdoptionGuide({
      projectName: "Acme Field Ops",
      scopeAreas: [],
      baseline: { entries: 0 },
    });

    expect(guide).toContain("Acme Field Ops");
    expect(guide).toContain("no paths declared in scope");
  });

  it("defaults generatedAt to today when omitted", () => {
    const guide = generateAdoptionGuide({
      projectName: "Acme Field Ops",
      scopeAreas: ["src/**"],
      baseline: { entries: 1 },
    });

    const today = new Date().toISOString().slice(0, 10);
    expect(guide).toContain(today);
  });

  it("omits the severity breakdown line when no severity counts are given", () => {
    const guide = generateAdoptionGuide({
      projectName: "Acme Field Ops",
      scopeAreas: ["src/**"],
      baseline: { entries: 42 },
    });

    expect(guide).toContain("42");
    expect(guide).not.toContain("Breakdown:");
  });
});
