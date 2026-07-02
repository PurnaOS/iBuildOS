import { test, expect } from "bun:test";
import { Collector, finalize, countBySeverity, type Finding } from "../src/core/model/model.ts";

test("finalize dedupes and stably sorts by file,line,rule,message", () => {
  const items: Finding[] = [
    { severity: "error", file: "b.md", line: 2, rule: "r", message: "m" },
    { severity: "warning", file: "a.md", line: 1, rule: "z", message: "m" },
    { severity: "warning", file: "a.md", line: 1, rule: "a", message: "m" },
    { severity: "error", file: "b.md", line: 2, rule: "r", message: "m" }, // dup
    { severity: "error", file: "a.md", line: 1, rule: "a", message: "m2" },
  ];
  const out = finalize(items);
  expect(out.map((f) => `${f.file}:${f.line}:${f.rule}:${f.message}`)).toEqual([
    "a.md:1:a:m",
    "a.md:1:a:m2",
    "a.md:1:z:m",
    "b.md:2:r:m",
  ]);
});

test("collector + countBySeverity", () => {
  const c = new Collector();
  c.errf("a.md", 1, "x", "boom");
  c.warnf("b.md", 0, "y", "meh");
  expect(c.items.length).toBe(2);
  expect(countBySeverity(c.items)).toEqual({ errors: 1, warnings: 1 });
});

test("toSlash normalizes separators in findings", () => {
  const c = new Collector();
  c.errf("a\\b\\c.md", 1, "x", "m");
  expect(c.items[0]!.file).toBe("a/b/c.md");
});
