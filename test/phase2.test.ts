import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { load } from "../src/core/config/config.ts";
import { validate } from "../src/core/validate/validate.ts";
import { matchFiles } from "../src/core/okf/glob.ts";
import { parse as parseOkf } from "../src/core/okf/frontmatter.ts";
import { readFileSync } from "node:fs";

const repoRoot = join(import.meta.dir, "..");

function bundle(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "p2-"));
  for (const [p, content] of Object.entries(files)) {
    const full = join(dir, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  const cfg = load(dir);
  cfg.typesDirOverride = join(repoRoot, "docs", "types");
  return { dir, cfg };
}

// --- Subset / scope primitive (VL-013 / IN-011 / VC-007 substrate) ---
test("scope filters returned findings to matching artifacts; full graph still resolves", () => {
  const dir = join(repoRoot, "test", "fixtures", "broken");
  const all = validate(dir, load(dir));
  expect(all.length).toBeGreaterThan(1);

  const scoped = validate(dir, load(dir), { scope: ["docs/work/task-nofile.md"] });
  expect(scoped.every((f) => f.file === "docs/work/task-nofile.md")).toBe(true);
  expect(scoped.map((f) => f.rule)).toEqual(["code.noMatch"]);

  // glob scope
  const byGlob = validate(dir, load(dir), { scope: ["docs/work/**"] });
  expect(byGlob.every((f) => f.file.startsWith("docs/work/"))).toBe(true);
});

// --- docs-lint (VL-011) ---
test("docs-lint flags a broken internal .md link, not a valid one or a URL", () => {
  const { dir, cfg } = bundle({
    "docs/requirements/x.md":
      "---\ntype: FunctionalRequirement\nid: FR-0009\ntitle: t\nowner: o\nstatus: proposed\n---\n" +
      "See [missing](missing.md), [self](x.md), and [spec](https://example.com/SPEC.md).\n",
  });
  const findings = validate(dir, cfg);
  const broken = findings.filter((f) => f.rule === "docs.brokenLink");
  expect(broken.length).toBe(1);
  expect(broken[0]!.message).toContain("missing.md");
  expect(broken[0]!.severity).toBe("warning"); // never fails the error-gate
});

// --- OKF conformance / offline (IO-001 / IO-006) ---
test("every bundle .md is OKF-readable (parse never throws; frontmatter -> mapping)", () => {
  const rootDir = join(repoRoot, "docs");
  const files = matchFiles(rootDir, ["**/*.md"]);
  expect(files.length).toBeGreaterThan(30);
  for (const rel of files) {
    const [d, err] = parseOkf(rel, readFileSync(join(rootDir, rel), "utf8"));
    expect(err, rel).toBeNull();
    if (d.hasFrontmatter) expect(d.map, rel).not.toBeNull();
  }
});
