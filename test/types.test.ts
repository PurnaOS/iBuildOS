import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Registry } from "../src/core/types/registry.ts";
import { compilePattern } from "../src/core/types/pattern.ts";
import { Collector } from "../src/core/model/model.ts";

function typesDir(files: Record<string, string>): string {
  const base = mkdtempSync(join(tmpdir(), "types-"));
  const dir = join(base, "types");
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return base; // bundleDir; typesDir = base/types
}

const META = `---
type: ArtifactType
defines: ArtifactType
fields:
  defines: { required: true }
---
`;
const WORKITEM = `---
type: ArtifactType
defines: WorkItem
abstract: true
fields:
  id: { required: true }
  title: { required: true }
  owner: { required: true }
  status: { required: true }
---
`;
const REQUIREMENT = `---
type: ArtifactType
defines: Requirement
extends: WorkItem
abstract: true
fields:
  priority: { one_of: [must, should, could, wont] }
---
`;
const FR = `---
type: ArtifactType
defines: FunctionalRequirement
extends: Requirement
fields:
  id: { required: true, pattern: "FR-<number>" }
---
`;
const TASK = `---
type: ArtifactType
defines: Task
extends: WorkItem
fields:
  id: { required: true, pattern: "TASK-<number>" }
  code: { type: list }
relationships:
  implements: { target: Requirement, min: 1 }
---
`;

function loadClean() {
  const base = typesDir({ "artifact-type.md": META, "work-item.md": WORKITEM, "requirement.md": REQUIREMENT, "functional-requirement.md": FR, "task.md": TASK, "overview.md": "---\ntype: Reference\n---\n# notes\n", "index.md": "# index\n" });
  const c = new Collector();
  const r = Registry.load(join(base, "types"), base, c);
  return { r, c };
}

test("registry: load, inheritance, capability predicates", () => {
  const { r, c } = loadClean();
  expect(c.items).toEqual([]); // clean profile, no meta-validation findings
  expect(r.has("Task")).toBe(true);
  expect(r.has("Nope")).toBe(false);
  // polymorphic target: FR is-a Requirement; Task is not
  expect(r.satisfies("FunctionalRequirement", "Requirement")).toBe(true);
  expect(r.satisfies("FunctionalRequirement", "WorkItem")).toBe(true);
  expect(r.satisfies("Task", "Requirement")).toBe(false);
  expect(r.isAbstract("Requirement")).toBe(true);
  expect(r.isAbstract("Task")).toBe(false);
  // relTargets is order-independent capability source
  expect(r.relTargets("implements")).toEqual(["Requirement"]);
  expect(r.satisfiesAny("FunctionalRequirement", r.relTargets("implements"))).toBe(true);
  expect(r.concreteSubtypes("Requirement")).toEqual(["FunctionalRequirement"]);
  // resolve flattens inherited fields (id/title/owner/status from WorkItem)
  const res = r.resolve("FunctionalRequirement")!;
  expect([...res.fields.keys()].sort()).toEqual(["id", "owner", "priority", "status", "title"]);
  expect(res.fields.get("id")!.re).toBeInstanceOf(RegExp);
});

test("registry: generic loader — alt taxonomy works with zero code change", () => {
  const base = typesDir({
    "artifact-type.md": META,
    "widget.md": "---\ntype: ArtifactType\ndefines: Widget\nabstract: true\n---\n",
    "gadget.md": "---\ntype: ArtifactType\ndefines: Gadget\nextends: Widget\n---\n",
  });
  const c = new Collector();
  const r = Registry.load(join(base, "types"), base, c);
  expect(c.items).toEqual([]);
  expect(r.satisfies("Gadget", "Widget")).toBe(true);
  expect(r.concreteSubtypes("Widget")).toEqual(["Gadget"]);
});

test("meta-validation: unknown extends, unknown target, missing target, bad field type, bad pattern", () => {
  const base = typesDir({
    "artifact-type.md": META,
    "a.md": "---\ntype: ArtifactType\ndefines: A\nextends: Ghost\n---\n",
    "b.md": "---\ntype: ArtifactType\ndefines: B\nrelationships:\n  rel: { target: Ghost }\n---\n",
    "c.md": "---\ntype: ArtifactType\ndefines: C\nrelationships:\n  rel: { }\n---\n",
    "d.md": "---\ntype: ArtifactType\ndefines: D\nfields:\n  x: { type: weird }\n---\n",
    "e.md": "---\ntype: ArtifactType\ndefines: E\nfields:\n  x: { pattern: \"regex:a)b\" }\n---\n",
  });
  const c = new Collector();
  Registry.load(join(base, "types"), base, c);
  const rules = c.items.map((f) => f.rule).sort();
  expect(rules).toContain("types.unknownExtends");
  expect(rules).toContain("types.unknownTarget");
  expect(rules).toContain("types.badMeta"); // missing target + bad field type
  expect(rules).toContain("types.badPattern");
});

test("meta-validation: extends cycle detected", () => {
  const base = typesDir({
    "artifact-type.md": META,
    "x.md": "---\ntype: ArtifactType\ndefines: X\nextends: Y\n---\n",
    "y.md": "---\ntype: ArtifactType\ndefines: Y\nextends: X\n---\n",
  });
  const c = new Collector();
  Registry.load(join(base, "types"), base, c);
  expect(c.items.some((f) => f.rule === "types.cycle")).toBe(true);
});

test("meta-validation: duplicate define", () => {
  const base = typesDir({
    "artifact-type.md": META,
    "a.md": "---\ntype: ArtifactType\ndefines: Dup\n---\n",
    "b.md": "---\ntype: ArtifactType\ndefines: Dup\n---\n",
  });
  const c = new Collector();
  Registry.load(join(base, "types"), base, c);
  expect(c.items.some((f) => f.rule === "types.duplicate")).toBe(true);
});

test("compilePattern: tokens, regex escape hatch, unknown token", () => {
  expect(compilePattern("FR-<number>").test("FR-0007")).toBe(true);
  expect(compilePattern("FR-<number>").test("FR-x")).toBe(false);
  expect(compilePattern("FR-<number>").test("xFR-1")).toBe(false); // anchored
  expect(compilePattern("<slug>").test("my-slug-1")).toBe(true);
  expect(compilePattern("<slug>").test("Bad_Slug")).toBe(false);
  expect(compilePattern("<date>").test("2026-06-30")).toBe(true);
  expect(compilePattern("<date>").test("2026-6-30")).toBe(false);
  expect(compilePattern("regex:v?\\d+\\.\\d+").test("v1.2")).toBe(true);
  expect(compilePattern("FR-<number>").test("FR-1\n")).toBe(false); // \z, no trailing newline
  expect(() => compilePattern("<bogus>")).toThrow();
});
