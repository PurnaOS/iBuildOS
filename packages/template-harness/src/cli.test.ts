import { describe, expect, it, vi } from "vitest";
import { formatReport, parseArgs } from "./cli.js";
import type { TemplateGuaranteeReport } from "./types.js";

// cli.ts's `main()` only runs when the module is executed directly (see its
// import.meta.url guard), so importing it here for parseArgs/formatReport
// doesn't spawn the guarantee pipeline or call process.exit as a side effect.

describe("parseArgs", () => {
  it("parses a bare template dir with no flags", () => {
    const result = parseArgs(["fixtures/good-template"]);
    expect(result.templateDir).toBe("fixtures/good-template");
    expect(result.options).toEqual({});
    expect(result.json).toBe(false);
  });

  it("parses --component, --port, and --json", () => {
    const result = parseArgs([
      "fixtures/good-template",
      "--component=app",
      "--port=5173",
      "--json",
    ]);
    expect(result.templateDir).toBe("fixtures/good-template");
    expect(result.options).toEqual({ component: "app", port: 5173 });
    expect(result.json).toBe(true);
  });

  it("exits 2 with a usage message when no template dir is given", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseArgs([])).toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("usage:"));

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("exits 2 with a usage message on an unrecognized flag", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseArgs(["fixtures/good-template", "--bogus=1"])).toThrow("EXIT");
    expect(exitSpy).toHaveBeenCalledWith(2);

    vi.restoreAllMocks();
  });
});

describe("formatReport", () => {
  function makeReport(overrides: Partial<TemplateGuaranteeReport> = {}): TemplateGuaranteeReport {
    return {
      templateDir: "/tmp/synthetic-fixture",
      component: "app",
      ok: false,
      steps: [
        { name: "manifest:template.yaml", status: "pass", durationMs: 3, detail: "ok" },
        {
          name: "command:build",
          status: "fail",
          durationMs: 12,
          detail: '"build" (pnpm run build) exited 1',
          command: ["pnpm", "run", "build"],
          exitCode: 1,
          stderr: "boom\nsecond line",
        },
        { name: "command:seed", status: "skipped", durationMs: 0, detail: "not declared" },
      ],
      ...overrides,
    };
  }

  it("renders a PASS header and one marker line per step", () => {
    const text = formatReport(makeReport({ ok: true }));
    expect(text).toContain('Template guarantee for /tmp/synthetic-fixture (component "app"): PASS');
    expect(text).toContain("[PASS] manifest:template.yaml");
    expect(text).toContain("[SKIP] command:seed");
  });

  it("renders FAIL and includes stderr for a failed step", () => {
    const text = formatReport(makeReport());
    expect(text).toContain(": FAIL");
    expect(text).toContain("[FAIL] command:build");
    expect(text).toContain("stderr:");
    expect(text).toContain("boom");
  });
});
