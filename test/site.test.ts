import { test, expect } from "bun:test";
import { join } from "node:path";
import { load } from "../src/core/config/config.ts";
import { buildExportGraph } from "../src/core/validate/export.ts";
import { validate } from "../src/core/validate/validate.ts";
import { renderSite } from "../src/core/site/site.ts";

const repoRoot = join(import.meta.dir, "..");

test("site renders a self-contained HTML portal derived from the repo", () => {
  const cfg = load(repoRoot);
  const { graph, reg } = buildExportGraph(repoRoot, cfg, { body: "none" });
  const html = renderSite(graph, reg, cfg, validate(repoRoot, cfg));
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html).toContain("iBuildOS");
  expect(html).toContain('id="data"'); // embedded JSON island
  expect(html).toContain("Traceability");
  // self-contained: no external script/style/link references
  expect(html).not.toMatch(/<script[^>]+src=/);
  expect(html).not.toMatch(/<link[^>]+href=/);
  // deterministic
  const again = renderSite(buildExportGraph(repoRoot, cfg, { body: "none" }).graph, reg, cfg, validate(repoRoot, cfg));
  expect(html).toBe(again);
});
