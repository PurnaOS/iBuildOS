import { describe, expect, it } from "vitest";
import { RULE_REGISTRY } from "@ibuildos/schemas";
import { runCli } from "../run.js";
import { fixturePath, repoRoot } from "../test-utils/fixtures.js";

describe("ibuildos rules", () => {
  it("lists every rule in the canonical registry, marking wired ones", async () => {
    const result = await runCli(["rules", "--format", "json"], { cwd: fixturePath("clean") });
    const rows = JSON.parse(result.stdout) as Array<{ id: string; wired: boolean }>;
    expect(rows).toHaveLength(Object.keys(RULE_REGISTRY).length);
    expect(rows.find((r) => r.id === "id/format")?.wired).toBe(true);
    // chain/* is a documented gap — see src/rules/checkers.ts's module comment.
    expect(rows.find((r) => r.id === "chain/story-untested")?.wired).toBe(false);
  });
});

describe("ibuildos gates", () => {
  it("lists the fixture profile's gate compositions", async () => {
    const result = await runCli(["gates", "--format", "json"], { cwd: fixturePath("clean") });
    const rows = JSON.parse(result.stdout) as Array<{ name: string; expanded: string[] }>;
    expect(rows.map((r) => r.name).sort()).toEqual(["requirement-ready", "story-ready", "well-formed"]);
  });

  it("lists the real shipped default profile's seven gates", async () => {
    const result = await runCli(["gates", "--profile", `${repoRoot()}/docs/profile`, "--format", "json"], {
      cwd: fixturePath("clean"), // cwd is irrelevant once --profile is explicit
    });
    const rows = JSON.parse(result.stdout) as Array<{ name: string }>;
    expect(rows.map((r) => r.name).sort()).toEqual(
      ["merge", "plan", "release-deploy", "requirement-ready", "story-ready", "stream-done", "stream-stage"].sort(),
    );
  });
});

describe("ibuildos instructions <Type>", () => {
  it("prints an authoring template for a type in the fixture profile", async () => {
    const result = await runCli(["instructions", "Story"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("type: Story");
    expect(result.stdout).toContain("## Acceptance criteria");
    expect(result.stdout).toContain("implements: [<Requirement>]");
  });

  it("resolves a type from the real shipped default profile (docs/profile)", async () => {
    const result = await runCli(
      ["instructions", "Story", "--profile", `${repoRoot()}/docs/profile`],
      { cwd: fixturePath("clean") },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("type: Story");
    expect(result.stdout).toContain("verified_by");
  });
});
