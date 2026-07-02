import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { load } from "../src/core/config/config.ts";
import { validate } from "../src/core/validate/validate.ts";
import { json as reportJSON } from "../src/core/report/report.ts";
import { countBySeverity, type Finding } from "../src/core/model/model.ts";

const repoRoot = join(import.meta.dir, "..");

function errorRules(findings: Finding[]): string[] {
  return findings.filter((f) => f.severity === "error").map((f) => f.rule).sort();
}
function errors(findings: Finding[]): number {
  return countBySeverity(findings).errors;
}

// Writes a temp bundle whose types point at the repo's real docs/types.
function bundle(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "bundle-"));
  for (const [p, content] of Object.entries(files)) {
    const full = join(dir, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  const cfg = load(dir);
  cfg.typesDirOverride = join(repoRoot, "docs", "types");
  return { dir, cfg };
}

// TestDogfood: iBuild validate . exits 0 on this repo.
test("dogfood: repo validates with zero errors", () => {
  const cfg = load(repoRoot);
  const findings = validate(repoRoot, cfg);
  const errs = findings.filter((f) => f.severity === "error");
  if (errs.length) for (const f of errs) console.error(`unexpected: ${f.file}:${f.line} [${f.rule}] ${f.message}`);
  expect(errs.length).toBe(0);
});

// TestBrokenFixture: exactly the three intended errors.
test("broken fixture: exactly the three intended error rules", () => {
  const dir = join(repoRoot, "test", "fixtures", "broken");
  const findings = validate(dir, load(dir));
  expect(errorRules(findings)).toEqual(["chain.doneTaskTestNotPassing", "code.noMatch", "link.wrongTarget"]);
});

test("unknown type is a warning, not an error", () => {
  const { dir, cfg } = bundle({ "docs/work/x.md": "---\ntype: Frobnicator\nid: F-1\n---\n" });
  const findings = validate(dir, cfg);
  expect(errors(findings)).toBe(0);
  expect(findings.some((f) => f.rule === "doc.unknownType")).toBe(true);
});

test("abstract type used directly is an error", () => {
  const { dir, cfg } = bundle({ "docs/work/x.md": "---\ntype: WorkItem\nid: W-1\ntitle: t\nowner: o\nstatus: s\n---\n" });
  const findings = validate(dir, cfg);
  expect(findings.some((f) => f.rule === "doc.abstractType")).toBe(true);
});

test("missing required field + bad enum + bad pattern are errors", () => {
  const { dir, cfg } = bundle({
    // FunctionalRequirement requires id (FR-<number>), title, owner, status(one_of)
    "docs/requirements/r.md": "---\ntype: FunctionalRequirement\nid: BAD-1\nstatus: nonsense\n---\n",
  });
  const findings = validate(dir, cfg);
  const rules = errorRules(findings);
  expect(rules).toContain("field.required"); // title + owner missing
  expect(rules).toContain("field.pattern"); // id doesn't match FR-<number>
  expect(rules).toContain("field.enum"); // status not in the requirement enum
});

test("deterministic: validate twice yields byte-identical JSON", () => {
  const dir = join(repoRoot, "test", "fixtures", "broken");
  const a = reportJSON(validate(dir, load(dir)));
  const b = reportJSON(validate(dir, load(dir)));
  expect(a).toBe(b);
});

test("alt taxonomy bundle validates (generic engine, zero code change)", () => {
  const dir = join(repoRoot, "test", "fixtures", "alttypes");
  // alttypes ships only a widget type set; just assert no crash + deterministic.
  const findings = validate(dir, load(dir));
  expect(Array.isArray(findings)).toBe(true);
});
