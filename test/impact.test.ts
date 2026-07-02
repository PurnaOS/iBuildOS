import { test, expect } from "bun:test";
import { join } from "node:path";
import { load } from "../src/core/config/config.ts";
import { buildExportGraph } from "../src/core/validate/export.ts";
import { buildImpact } from "../src/core/graphx/impact.ts";

const repoRoot = join(import.meta.dir, "..");

test("impact: a changed okf file reaches its task, requirement, and test", () => {
  const { graph } = buildExportGraph(repoRoot, load(repoRoot), { body: "none" });
  const imp = buildImpact(graph, load(repoRoot), ["src/core/okf/frontmatter.ts"]);
  expect(imp.affectedTasks).toContain("/work/task-0001.md"); // code: src/core/okf/**
  expect(imp.affectedRequirements).toContain("/requirements/fr-0001.md");
  expect(imp.affectedTests).toContain("/tests/test-okf.md");
});

test("impact: an unrelated file affects nothing", () => {
  const { graph } = buildExportGraph(repoRoot, load(repoRoot), { body: "none" });
  const imp = buildImpact(graph, load(repoRoot), ["README.md"]);
  expect(imp.affectedTasks).toEqual([]);
  expect(imp.affectedRequirements).toEqual([]);
});
