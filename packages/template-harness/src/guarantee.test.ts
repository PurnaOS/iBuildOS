import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runTemplateGuarantee } from "./guarantee.js";
import type { StepResult, TemplateGuaranteeReport } from "./types.js";

// End-to-end proof of TP-003's zero-fix guarantee against real synthetic
// fixture templates (see fixtures/*/README-equivalent comments in each
// template.yaml). These spawn real `pnpm install` and real subprocesses, so
// they get a generous per-test timeout rather than vitest's 5s default.

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "..", "fixtures");

function step(report: TemplateGuaranteeReport, name: string): StepResult {
  const found = report.steps.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no step named "${name}" in report: ${JSON.stringify(report.steps.map((s) => s.name))}`);
  return found;
}

describe("runTemplateGuarantee — good-template (every step passes)", () => {
  it(
    "validates, installs, runs every contract command, and serves the preview",
    async () => {
      const report = await runTemplateGuarantee(join(fixturesRoot, "good-template"), {
        previewTimeoutMs: 5000,
        previewPollIntervalMs: 100,
      });

      expect(report.component).toBe("app");
      expect(report.steps.map((s) => s.name)).toEqual([
        "manifest:template.yaml",
        "manifest:ibuildos.yaml",
        "contract:component-select",
        "install",
        "command:lint",
        "command:build",
        "command:migrate",
        "command:seed",
        "command:test",
        "dev:start",
        "preview:poll",
        "dev:stop",
      ]);

      for (const s of report.steps) {
        expect(s.status, `expected "${s.name}" to pass, got ${s.status}: ${s.detail}`).toBe("pass");
      }
      expect(report.ok).toBe(true);
    },
    30_000,
  );
});

describe("runTemplateGuarantee — bad-build-template (build exits non-zero)", () => {
  it(
    "reports the build command as a failure without skipping the rest of the pipeline",
    async () => {
      const report = await runTemplateGuarantee(join(fixturesRoot, "bad-build-template"), {
        previewTimeoutMs: 5000,
        previewPollIntervalMs: 100,
      });

      expect(report.ok).toBe(false);
      expect(step(report, "command:build")).toMatchObject({ status: "fail", exitCode: 1 });
      expect(step(report, "command:build").stderr).toContain("intentional failure");

      // A build failure isn't a reason to stop reporting on everything else —
      // lint ran before it and passed, and dev/preview are unaffected.
      expect(step(report, "command:lint").status).toBe("pass");
      expect(step(report, "command:test").status).toBe("pass");
      expect(step(report, "dev:start").status).toBe("pass");
      expect(step(report, "preview:poll").status).toBe("pass");
    },
    30_000,
  );
});

describe("runTemplateGuarantee — bad-dev-template (dev server never comes up)", () => {
  it(
    "reports a preview timeout as a failure, not a hang, and still cleans up",
    async () => {
      const report = await runTemplateGuarantee(join(fixturesRoot, "bad-dev-template"), {
        previewTimeoutMs: 1500,
        previewPollIntervalMs: 100,
      });

      expect(report.ok).toBe(false);
      expect(step(report, "dev:start").status).toBe("pass"); // the process itself started fine
      expect(step(report, "preview:poll").status).toBe("fail");
      expect(step(report, "preview:poll").detail).toMatch(/timed out/);
      expect(step(report, "dev:stop").status).toBe("pass"); // no dangling process left behind

      // Everything unrelated to the dev server still ran and passed.
      expect(step(report, "command:build").status).toBe("pass");
      expect(step(report, "command:test").status).toBe("pass");
    },
    30_000,
  );
});

describe("runTemplateGuarantee — bad-manifest-template (template.yaml fails schema validation)", () => {
  it(
    "reports the manifest failure and skips everything downstream",
    async () => {
      const report = await runTemplateGuarantee(join(fixturesRoot, "bad-manifest-template"));

      expect(report.ok).toBe(false);
      expect(step(report, "manifest:template.yaml").status).toBe("fail");
      expect(step(report, "manifest:template.yaml").detail).toContain("engine");

      // ibuildos.yaml is independently valid — its own check isn't dragged down.
      expect(step(report, "manifest:ibuildos.yaml").status).toBe("pass");

      for (const name of [
        "contract:component-select",
        "install",
        "command:lint",
        "command:build",
        "command:migrate",
        "command:seed",
        "command:test",
        "dev:start",
        "preview:poll",
        "dev:stop",
      ]) {
        expect(step(report, name).status, name).toBe("skipped");
      }
    },
    10_000,
  );
});
