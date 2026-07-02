import { test, expect } from "bun:test";
import { join } from "node:path";
import { load } from "../src/core/config/config.ts";
import { validate } from "../src/core/validate/validate.ts";
import { makeBaseline, applyBaseline } from "../src/core/validate/baseline.ts";
import type { Finding } from "../src/core/model/model.ts";

const repoRoot = join(import.meta.dir, "..");

test("baseline suppresses accepted debt but never new violations (ratchet)", () => {
  const dir = join(repoRoot, "test", "fixtures", "broken");
  const findings = validate(dir, load(dir));
  expect(findings.filter((f) => f.severity === "error").length).toBe(3);

  // Accept all current findings as baseline → nothing is fresh.
  const bl = makeBaseline(findings);
  const accepted = applyBaseline(findings, bl);
  expect(accepted.fresh).toEqual([]);
  expect(accepted.baselined.length).toBe(findings.length);

  // A NEW violation is not in the baseline → it stays fresh (the gate still catches it).
  const fresh: Finding = { severity: "error", file: "docs/work/new.md", line: 1, rule: "code.noMatch", message: "brand new" };
  const split = applyBaseline([...findings, fresh], bl);
  expect(split.fresh).toEqual([fresh]);
});

test("baseline is deterministic + line-insensitive", () => {
  const dir = join(repoRoot, "test", "fixtures", "broken");
  const f = validate(dir, load(dir));
  expect(JSON.stringify(makeBaseline(f))).toBe(JSON.stringify(makeBaseline(f)));
  // fingerprint excludes line: same rule/file/message at a different line is still baselined
  const moved = f.map((x) => ({ ...x, line: x.line + 100 }));
  expect(applyBaseline(moved, makeBaseline(f)).fresh).toEqual([]);
});
