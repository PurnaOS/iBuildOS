import { test, expect } from "bun:test";
import { join } from "node:path";
import { load } from "../src/core/config/config.ts";
import { buildExportGraph } from "../src/core/validate/export.ts";
import { validate } from "../src/core/validate/validate.ts";
import { buildStatus } from "../src/core/metrics/status.ts";
import { buildMine } from "../src/core/metrics/mine.ts";

const repoRoot = join(import.meta.dir, "..");

test("status: validation clean, requirement coverage, by-type/by-status rollups", () => {
  const cfg = load(repoRoot);
  const { graph, reg } = buildExportGraph(repoRoot, cfg, { body: "none" });
  const s = buildStatus(graph, reg, cfg, validate(repoRoot, cfg));
  expect(s.validation.errors).toBe(0);
  expect(s.requirements.requirements).toBeGreaterThan(190);
  expect(s.requirements.traced).toBeGreaterThanOrEqual(1); // the seed chain
  expect(s.byType.CatalogRequirement).toBeGreaterThanOrEqual(180);
  expect(s.byStatus.draft).toBeGreaterThanOrEqual(180);
  // the only active requirement is fully implemented, so no active orphans
  expect(s.orphanActiveRequirements).toEqual([]);
});

test("mine: owned work resolves by the owner field", () => {
  const cfg = load(repoRoot);
  const { graph } = buildExportGraph(repoRoot, cfg, { body: "none" });
  const mine = buildMine(graph, "srini");
  expect(mine.owned).toContain("/requirements/fr-0001.md");
  expect(mine.owned).toContain("/work/task-0001.md");
  expect(buildMine(graph, "nobody").owned).toEqual([]);
});
