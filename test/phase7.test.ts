import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "../src/core/config/config.ts";
import { buildExportGraph } from "../src/core/validate/export.ts";
import { buildGaps } from "../src/core/graphx/gaps.ts";
import { matchFiles } from "../src/core/okf/glob.ts";
import { runCommand, testResultDoc } from "../src/core/tooling/orchestrate.ts";
import { validate } from "../src/core/validate/validate.ts";

const repoRoot = join(import.meta.dir, "..");

test("gaps: orphan source files + active requirements fully traced", () => {
  const cfg = load(repoRoot);
  const sourceFiles = matchFiles(repoRoot, ["src/**"]);
  const { graph, reg } = buildExportGraph(repoRoot, cfg, { body: "none" });
  const gaps = buildGaps(graph, reg, cfg, sourceFiles);
  // okf is linked to task-0001 (code: src/core/okf/**); cli.ts is not linked to any task
  expect(gaps.orphanCode).toContain("src/cli.ts");
  expect(gaps.orphanCode).not.toContain("src/core/okf/frontmatter.ts");
  // the only active requirement (FR-0001) is implemented + verified
  expect(gaps.untestedRequirements).toEqual([]);
  expect(gaps.unimplementedRequirements).toEqual([]);
});

test("orchestrate: runCommand captures exit + output", () => {
  expect(runCommand("ok", "echo hello", repoRoot).output).toContain("hello");
  expect(runCommand("ok", "echo hello", repoRoot).exit).toBe(0);
  expect(runCommand("fail", "exit 3", repoRoot).exit).toBe(3);
});

test("a recorded TestResult artifact is OKF-conformant (TT-008)", () => {
  const dir = mkdtempSync(join(tmpdir(), "tr-"));
  mkdirSync(join(dir, "docs", "tests"), { recursive: true });
  writeFileSync(join(dir, "docs", "tests", "r.md"), testResultDoc("ci-2026-06-30", "passed", "bun test", "2026-06-30"));
  const cfg = load(dir);
  cfg.typesDirOverride = join(repoRoot, "docs", "types");
  const errs = validate(dir, cfg).filter((f) => f.severity === "error");
  expect(errs.length).toBe(0);
});
