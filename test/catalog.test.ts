// Phase 4 gate: the master spec is decomposed into individual OKF artifacts that
// validate clean, with unique IDs.
import { test, expect } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { load } from "../src/core/config/config.ts";
import { validate } from "../src/core/validate/validate.ts";
import { matchFiles } from "../src/core/okf/glob.ts";
import { parse as parseOkf, scalarText } from "../src/core/okf/frontmatter.ts";

const repoRoot = join(import.meta.dir, "..");

function artifacts() {
  const cfg = load(repoRoot);
  const root = cfg.rootDir();
  const out: { rel: string; type: string; id: string }[] = [];
  for (const rel of matchFiles(root, cfg.artifacts)) {
    if (!rel.endsWith(".md")) continue;
    const [d] = parseOkf(rel, readFileSync(join(root, rel), "utf8"));
    if (!d.hasFrontmatter) continue;
    out.push({ rel, type: scalarText(d.get("type")?.valNode), id: scalarText(d.get("id")?.valNode) });
  }
  return out;
}

test("decomposed bundle validates with zero errors", () => {
  const errs = validate(repoRoot, load(repoRoot)).filter((f) => f.severity === "error");
  expect(errs.length).toBe(0);
});

test("the full catalog is present (CatalogRequirements + ADRs + adoption tracker)", () => {
  const arts = artifacts();
  const byType = (t: string) => arts.filter((a) => a.type === t);
  expect(byType("CatalogRequirement").length).toBeGreaterThanOrEqual(180);
  expect(byType("ADR").length).toBe(12);
  expect(byType("Initiative").length).toBe(1);
  expect(byType("Epic").length).toBe(14); // one per phase 0..13
});

test("every artifact id is unique", () => {
  const ids = artifacts().map((a) => a.id).filter(Boolean);
  const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
  expect(dups).toEqual([]);
});

test("CatalogRequirements are catalogued at draft (draw no chain findings)", () => {
  const cfg = load(repoRoot);
  const root = cfg.rootDir();
  for (const rel of matchFiles(root, ["requirements/**"])) {
    if (!rel.endsWith(".md")) continue;
    const [d] = parseOkf(rel, readFileSync(join(root, rel), "utf8"));
    if (scalarText(d.get("type")?.valNode) === "CatalogRequirement") {
      expect(scalarText(d.get("status")?.valNode), rel).toBe("draft");
    }
  }
});
