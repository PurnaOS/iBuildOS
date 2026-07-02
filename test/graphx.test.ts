import { test, expect } from "bun:test";
import { join } from "node:path";
import { load } from "../src/core/config/config.ts";
import { buildExportGraph } from "../src/core/validate/export.ts";
import { stableJSON } from "../src/core/graphx/encode.ts";
import { toGraphML } from "../src/core/graphx/graphml.ts";
import { buildRtm } from "../src/core/graphx/rtm.ts";
import { write as instructions } from "../src/core/instructions/instructions.ts";
import { Registry } from "../src/core/types/registry.ts";
import { Collector } from "../src/core/model/model.ts";

const repoRoot = join(import.meta.dir, "..");
function reg() {
  return Registry.load(load(repoRoot).typesDir(), repoRoot, new Collector());
}

test("graph is deterministic (byte-identical across builds)", () => {
  const a = stableJSON(buildExportGraph(repoRoot, load(repoRoot)).graph);
  const b = stableJSON(buildExportGraph(repoRoot, load(repoRoot)).graph);
  expect(a).toBe(b);
});

test("graph projects the whole bundle: types, nodes, typed edges", () => {
  const { graph } = buildExportGraph(repoRoot, load(repoRoot), { body: "none" });
  expect(graph.types.length).toBeGreaterThan(30);
  expect(graph.nodes.length).toBeGreaterThan(200); // ~191 catalog + ADRs + work + seed
  // the seed chain edges exist
  const rels = new Set(graph.edges.map((e) => e.relationship));
  expect(rels.has("implements")).toBe(true);
  expect(rels.has("verifies")).toBe(true);
  expect(graph.nodes.some((n) => n.key === "/requirements/fr-0001.md")).toBe(true);
});

test("focus returns a node's neighborhood (forward + backward)", () => {
  const { graph } = buildExportGraph(repoRoot, load(repoRoot), { body: "none", node: "/requirements/fr-0001.md", depth: 1 });
  const keys = new Set(graph.nodes.map((n) => n.key));
  expect(keys.has("/requirements/fr-0001.md")).toBe(true);
  expect(keys.has("/work/task-0001.md")).toBe(true); // implements fr-0001
  expect(keys.has("/tests/test-okf.md")).toBe(true); // verifies fr-0001
});

test("RTM: seed requirement is traced; catalog requirements are not yet", () => {
  const { graph, reg: r } = buildExportGraph(repoRoot, load(repoRoot), { body: "none" });
  const rtm = buildRtm(graph, r, load(repoRoot));
  expect(rtm.summary.requirements).toBeGreaterThan(190);
  const fr = rtm.requirements.find((row) => row.key === "/requirements/fr-0001.md");
  expect(fr?.traced).toBe(true);
  expect(fr?.implementedBy).toContain("/work/task-0001.md");
  expect(fr?.verifiedBy).toContain("/tests/test-okf.md");
});

test("GraphML export is well-formed XML with nodes + edges", () => {
  const { graph } = buildExportGraph(repoRoot, load(repoRoot), { body: "none" });
  const xml = toGraphML(graph);
  expect(xml).toContain('<graphml xmlns="http://graphml.graphdrawing.org/xmlns">');
  expect(xml).toContain("<node ");
  expect(xml).toContain("<edge ");
  expect(xml.trimEnd().endsWith("</graphml>")).toBe(true);
});

test("instructions: per-type template, list, and unknown-type error", () => {
  const r = reg();
  const task = instructions(r, "Task", "text");
  expect(task).toContain("Template:");
  expect(task).toContain("implements");
  const list = instructions(r, "", "text");
  expect(list).toContain("Defined artifact types");
  const j = JSON.parse(instructions(r, "Task", "json"));
  expect(j.name).toBe("Task");
  expect(() => instructions(r, "Nope", "text")).toThrow();
});
