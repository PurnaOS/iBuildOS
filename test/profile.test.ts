// Proves the repo's authored base profile (docs/types/*.md) is well-formed:
// it loads with ZERO meta-validation findings and the §9 type graph resolves.
import { test, expect } from "bun:test";
import { join } from "node:path";
import { load } from "../src/core/config/config.ts";
import { Registry } from "../src/core/types/registry.ts";
import { Collector } from "../src/core/model/model.ts";

const repoRoot = join(import.meta.dir, "..");

function loadProfile() {
  const cfg = load(repoRoot);
  const c = new Collector();
  const r = Registry.load(cfg.typesDir(), repoRoot, c);
  return { r, c };
}

test("base profile loads with no meta-validation findings", () => {
  const { c } = loadProfile();
  expect(c.items).toEqual([]);
});

test("§9 type graph: inheritance + capability predicates", () => {
  const { r } = loadProfile();
  // requirements
  expect(r.satisfies("FunctionalRequirement", "Requirement")).toBe(true);
  expect(r.satisfies("NonFunctionalRequirement", "Requirement")).toBe(true);
  expect(r.satisfies("BusinessRequirement", "Requirement")).toBe(true);
  // work breakdown
  expect(r.satisfies("Task", "BacklogItem")).toBe(true);
  expect(r.satisfies("Task", "WorkItem")).toBe(true);
  // identity
  expect(r.satisfies("User", "Actor")).toBe(true);
  expect(r.satisfies("Team", "Actor")).toBe(true);
  expect(r.isAbstract("Actor")).toBe(true);
  // knowledge + coordination types defined
  for (const t of ["ADR", "Architecture", "Runbook", "MeetingNote", "RetroAction", "StandupLog", "RequirementsSpecification"]) {
    expect(r.has(t)).toBe(true);
  }
});

test("§9 relationship vocabulary present + correctly targeted", () => {
  const { r } = loadProfile();
  expect(r.relTargets("implements")).toEqual(["Requirement"]);
  expect(r.relTargets("verifies")).toEqual(["Requirement"]);
  expect(r.relTargets("verified_by")).toEqual(["Test"]);
  expect(r.relTargets("assignee")).toEqual(["Actor"]);
  expect(r.relTargets("fixed_by")).toEqual(["Task"]);
  // assignee is inherited by every WorkItem subtype
  expect(r.resolve("Task")!.rels.has("assignee")).toBe(true);
  expect(r.resolve("Bug")!.rels.has("fixed_by")).toBe(true);
});
