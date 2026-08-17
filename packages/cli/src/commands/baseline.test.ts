import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BaselineSchema } from "@ibuildos/schemas";
import { runCli } from "../run.js";
import { copyFixtureToTemp } from "../test-utils/fixtures.js";

describe("ibuildos baseline write | show", () => {
  it("show reports no baseline before one is ever written", async () => {
    const cwd = copyFixtureToTemp("invalid-missing-field");
    const result = await runCli(["baseline", "show"], { cwd });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no .ibuildos/baseline.json found");
  });

  it("write snapshots the bundle's current findings, and show reads them back", async () => {
    const cwd = copyFixtureToTemp("invalid-missing-field");

    const write = await runCli(["baseline", "write"], { cwd });
    expect(write.code).toBe(0);
    expect(existsSync(join(cwd, ".ibuildos", "baseline.json"))).toBe(true);

    const show = await runCli(["baseline", "show", "--format", "json"], { cwd });
    const baseline = BaselineSchema.parse(JSON.parse(show.stdout));
    expect(baseline.entries).toEqual([
      expect.objectContaining({ rule: "doc/field-required", artifact: "ST-0099" }),
    ]);
  });

  it("validate --baseline treats a previously written finding as baselined, not blocking", async () => {
    const cwd = copyFixtureToTemp("invalid-missing-field");
    await runCli(["baseline", "write"], { cwd });

    const result = await runCli(["validate", "--baseline", "--format", "json"], { cwd });
    expect(result.code).toBe(0); // no longer blocking
    const report = JSON.parse(result.stdout);
    expect(report.findings).toEqual([]);
    expect(report.summary.baselined).toBe(1);
  });
});
