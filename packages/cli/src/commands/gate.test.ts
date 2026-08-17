import { describe, expect, it } from "vitest";
import { FindingsReportSchema } from "@ibuildos/schemas";
import { runCli } from "../run.js";
import { fixturePath } from "../test-utils/fixtures.js";

describe("ibuildos gate <name>", () => {
  it("a gate composed entirely of wired rules exits 0 against the clean fixture", async () => {
    const result = await runCli(["gate", "well-formed", "--format", "json"], {
      cwd: fixturePath("clean"),
    });
    const report = FindingsReportSchema.parse(JSON.parse(result.stdout));
    expect(result.code).toBe(0);
    expect(report.gate).toBe("well-formed");
    expect(report.findings).toEqual([]);
  });

  it("the same gate against an invalid fixture reports the violation and exits 1", async () => {
    const result = await runCli(["gate", "well-formed", "--format", "json"], {
      cwd: fixturePath("invalid-missing-field"),
    });
    const report = FindingsReportSchema.parse(JSON.parse(result.stdout));
    expect(result.code).toBe(1);
    expect(report.findings).toEqual([
      expect.objectContaining({ rule: "doc/field-required", artifact: "ST-0099", subject: "owner" }),
    ]);
  });

  it("--commit overrides the git-derived commit sha", async () => {
    const result = await runCli(["gate", "well-formed", "--format", "json", "--commit", "deadbeef"], {
      cwd: fixturePath("clean"),
    });
    const report = FindingsReportSchema.parse(JSON.parse(result.stdout));
    expect(report.commit).toBe("deadbeef");
  });

  it("a pin mismatch refuses before evaluating the gate at all", async () => {
    const result = await runCli(["gate", "well-formed"], { cwd: fixturePath("pin-mismatch") });
    expect(result.code).toBe(3);
  });

  it("--annotate-only forces exit 0 on an evaluated gate's findings", async () => {
    const result = await runCli(["gate", "well-formed", "--annotate-only"], {
      cwd: fixturePath("invalid-missing-field"),
    });
    expect(result.code).toBe(0);
  });
});
