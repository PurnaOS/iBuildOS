// NFR-003: validation + the graph projection must be fast enough for pre-commit
// and CI. This repo's bundle is ~220 artifacts; the ceiling is deliberately
// generous (cold Bun start dominates) — it guards against accidental O(n²) rot.
import { test, expect } from "bun:test";
import { join } from "node:path";
import { load } from "../src/core/config/config.ts";
import { validate } from "../src/core/validate/validate.ts";
import { buildExportGraph } from "../src/core/validate/export.ts";

const repoRoot = join(import.meta.dir, "..");

test("validates the full bundle well under the pre-commit budget", () => {
  const cfg = load(repoRoot);
  const t0 = performance.now();
  const findings = validate(repoRoot, cfg);
  const ms = performance.now() - t0;
  expect(findings.filter((f) => f.severity === "error").length).toBe(0);
  expect(ms).toBeLessThan(3000);
});

test("builds the graph projection quickly", () => {
  const cfg = load(repoRoot);
  const t0 = performance.now();
  buildExportGraph(repoRoot, cfg, { body: "none" });
  expect(performance.now() - t0).toBeLessThan(3000);
});
