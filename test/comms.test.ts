import { test, expect } from "bun:test";
import { join } from "node:path";
import { load } from "../src/core/config/config.ts";
import { buildExportGraph } from "../src/core/validate/export.ts";
import { validate } from "../src/core/validate/validate.ts";
import { statusReport, releaseNotes } from "../src/core/report/comms.ts";

const repoRoot = join(import.meta.dir, "..");

test("statusReport is a suggest-only markdown draft derived from the repo", () => {
  const cfg = load(repoRoot);
  const { graph, reg } = buildExportGraph(repoRoot, cfg, { body: "none" });
  const md = statusReport(graph, reg, cfg, validate(repoRoot, cfg));
  expect(md).toContain("# Status Report");
  expect(md).toContain("draft for human review");
  expect(md).toContain("## Requirements");
  expect(md).toMatch(/\d+ total/);
});

test("releaseNotes renders shipped/in-progress sections for a release", () => {
  const cfg = load(repoRoot);
  const { graph } = buildExportGraph(repoRoot, cfg, { body: "none" });
  const md = releaseNotes(graph, cfg, "/work/nonexistent-release.md");
  expect(md).toContain("# Release Notes");
  expect(md).toContain("## Shipped");
  expect(md).toContain("## In progress");
});
