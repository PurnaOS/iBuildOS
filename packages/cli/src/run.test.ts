import { describe, expect, it } from "vitest";
import { FindingsReportSchema } from "@ibuildos/schemas";
import { runCli } from "./run.js";
import { fixturePath } from "./test-utils/fixtures.js";

async function validateJson(fixture: string, extraArgs: string[] = []) {
  const result = await runCli(["validate", "--format", "json", ...extraArgs], {
    cwd: fixturePath(fixture),
  });
  const report = FindingsReportSchema.parse(JSON.parse(result.stdout));
  return { result, report };
}

describe("ibuildos validate — the five required behaviors", () => {
  it("a clean fixture bundle exits 0 with zero findings", async () => {
    const { result, report } = await validateJson("clean");
    expect(result.code).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.summary).toEqual({ errors: 0, warnings: 0, info: 0, baselined: 0 });
  });

  it("invalid-id-format exits 1 with exactly the id/format violation", async () => {
    const { result, report } = await validateJson("invalid-id-format");
    expect(result.code).toBe(1);
    expect(report.findings).toEqual([
      expect.objectContaining({
        rule: "id/format",
        artifact: "STORY-42",
        subject: "id",
        severity: "error",
      }),
    ]);
  });

  it("invalid-missing-field exits 1 with exactly the doc/field-required violation", async () => {
    const { result, report } = await validateJson("invalid-missing-field");
    expect(result.code).toBe(1);
    expect(report.findings).toEqual([
      expect.objectContaining({
        rule: "doc/field-required",
        artifact: "ST-0099",
        subject: "owner",
        severity: "error",
      }),
    ]);
  });

  it("invalid-wrong-kind exits 1 with exactly the doc/field-kind violation", async () => {
    const { result, report } = await validateJson("invalid-wrong-kind");
    expect(result.code).toBe(1);
    expect(report.findings).toEqual([
      expect.objectContaining({
        rule: "doc/field-kind",
        artifact: "ST-0098",
        subject: "estimate",
        severity: "error",
      }),
    ]);
  });

  it("an engine/profile pin mismatch refuses with exit code 3", async () => {
    const { result, report } = await validateJson("pin-mismatch");
    expect(result.code).toBe(3);
    expect(report.findings.some((f) => f.rule === "pin/profile")).toBe(true);
  });

  it("findings JSON round-trips through FindingsReportSchema.parse() for every scenario", async () => {
    for (const fixture of ["clean", "invalid-id-format", "invalid-missing-field", "invalid-wrong-kind", "pin-mismatch"]) {
      const result = await runCli(["validate", "--format", "json"], { cwd: fixturePath(fixture) });
      expect(() => FindingsReportSchema.parse(JSON.parse(result.stdout))).not.toThrow();
    }
  });

  it("--annotate-only forces exit 0 despite findings being present", async () => {
    const { result, report } = await validateJson("invalid-missing-field", ["--annotate-only"]);
    expect(result.code).toBe(0);
    expect(report.summary.errors).toBe(1);
  });

  it("--annotate-only does NOT override a pin-mismatch refusal (a refusal, not a finding)", async () => {
    const result = await runCli(["validate", "--annotate-only"], { cwd: fixturePath("pin-mismatch") });
    expect(result.code).toBe(3);
  });
});

describe("ibuildos validate — other behavior", () => {
  it("defaults to --format text and reports a summary line", async () => {
    const result = await runCli(["validate"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("0 error(s)");
  });

  it("no ibuildos.yaml present means no pin to check — proceeds normally", async () => {
    // invalid-id-format has no ibuildos.yaml at all.
    const result = await runCli(["validate"], { cwd: fixturePath("invalid-id-format") });
    expect(result.code).toBe(1); // the id/format finding, not a pin refusal (3)
  });

  it("an explicit path argument scopes the artifact walk but still resolves the real project profile", async () => {
    const result = await runCli(["validate", "docs/stories", "--format", "json"], {
      cwd: fixturePath("clean"),
    });
    const report = FindingsReportSchema.parse(JSON.parse(result.stdout));
    // docs/requirements, docs/tests, docs/design fall out of scope, so every
    // link ST-0042/ST-0041 make to a Requirement/TestCase/DesignDirection now
    // dangles — proving the profile (docs/profile) was still resolved
    // correctly (the artifacts' declared fields/links were actually checked)
    // rather than silently going unfound, which is what happened before
    // `resolveProfileDir` was threaded through independently of the
    // positional bundle-root override (profileDir used to default to
    // `<bundleRoot>/profile` = `docs/stories/profile`, which doesn't exist,
    // so every type-driven rule quietly no-opped and this scenario reported
    // a false "0 errors").
    expect(result.code).toBe(1);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.every((f) => f.rule === "link/target-exists")).toBe(true);
    expect(report.findings.some((f) => f.rule === "doc/field-required")).toBe(false);
  });
});

describe("usage errors (exit code 2)", () => {
  it("no command at all prints usage and exits 0 (not an error)", async () => {
    const result = await runCli([], { cwd: fixturePath("clean") });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("usage:");
  });

  it("an unknown command", async () => {
    const result = await runCli(["bogus-command"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(2);
  });

  it("an unknown flag on validate", async () => {
    const result = await runCli(["validate", "--bogus-flag"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(2);
  });

  it("an invalid --format value", async () => {
    const result = await runCli(["validate", "--format", "xml"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(2);
  });

  it("--changed and --base together", async () => {
    const result = await runCli(["validate", "--changed", "--base", "main"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(2);
  });

  it("gate with no name", async () => {
    const result = await runCli(["gate"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(2);
  });

  it("gate with an unknown gate name", async () => {
    const result = await runCli(["gate", "does-not-exist"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(2);
  });

  it("instructions with no type", async () => {
    const result = await runCli(["instructions"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(2);
  });

  it("instructions with an unknown type", async () => {
    const result = await runCli(["instructions", "NoSuchType"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(2);
  });

  it("baseline with neither write nor show", async () => {
    const result = await runCli(["baseline"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(2);
  });

  it("graph with neither export nor matrix", async () => {
    const result = await runCli(["graph"], { cwd: fixturePath("clean") });
    expect(result.code).toBe(2);
  });
});

describe("internal fault (exit code 4)", () => {
  // This asserts run.ts's top-level catch, not that malformed OKF specifically
  // must be fatal — `parseOkfDocument` throwing OkfParseError on an unclosed
  // frontmatter block is just the cheapest way to make the bundle loader
  // throw something unanticipated. If a future engine change makes malformed
  // OKF a tolerated finding instead (KB-008), this fixture stops being useful
  // for that reason and a different throw should replace it — the behavior
  // under test is "an uncaught throw anywhere in the command maps to exit 4",
  // not "this fixture is fatal forever."
  it("an unexpected throw (here: malformed OKF frontmatter) maps to exit 4, not an uncaught crash", async () => {
    const result = await runCli(["validate"], { cwd: fixturePath("internal-fault") });
    expect(result.code).toBe(4);
    expect(result.stderr).toContain("internal fault");
  });
});
