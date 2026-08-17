import { describe, expect, it } from "vitest";
import { ProfileRegistry } from "../profile/registry.js";
import { ArtifactGraph } from "../graph/graph.js";
import { computeChangeImpact } from "./impact.js";

// Minimal, self-contained profile for this module's fixtures (no file I/O — mirrors
// rules/chain.test.ts's inline-TypeDefinition pattern). Deliberately separate from
// fixtures/graph/profile/* (off-limits to modify) and from docs/profile/* (the shipped
// profile) — just enough shape for `registry.satisfies` to classify WorkItem/TestCase.
function buildRegistry(): ProfileRegistry {
  return ProfileRegistry.fromRawDocuments([
    `---
type: TypeDefinition
defines: WorkItem
abstract: true
fields: {}
links: {}
body: { sections: [] }
---
`,
    `---
type: TypeDefinition
defines: ProductBrief
abstract: false
prefix: PB
fields: {}
links: {}
body: { sections: [] }
---
`,
    `---
type: TypeDefinition
defines: Requirement
abstract: false
prefix: RQ
fields: {}
links:
  traces_to: { target: [ProductBrief] }
body: { sections: [] }
---
`,
    `---
type: TypeDefinition
defines: Story
extends: WorkItem
abstract: false
prefix: ST
fields: {}
links:
  implements: { target: [Requirement] }
body: { sections: [] }
---
`,
    `---
type: TypeDefinition
defines: TestCase
abstract: false
prefix: TC
fields: {}
links:
  verifies: { target: [Requirement, Story] }
body: { sections: [] }
---
`,
  ]);
}

// A representative before/after edit to RQ-0001: two Stories and two TestCases link
// directly to it (one Story done, one building, one draft; one TestCase active, one
// retired); a third TestCase verifies ST-0001 (two hops back from RQ-0001, proving
// backward reachability is transitive, not just direct incoming edges); RQ-0001 itself
// traces_to a ProductBrief (forward direction); ST-0099 links to an unrelated,
// non-existent requirement and must not appear in either set.
function buildGraph(): ArtifactGraph {
  return new ArtifactGraph([
    {
      id: "RQ-0001",
      type: "Requirement",
      frontmatter: { state: "ready", links: { traces_to: ["PB-0001"] } },
    },
    { id: "PB-0001", type: "ProductBrief", frontmatter: { state: "approved" } },
    {
      id: "ST-0001",
      type: "Story",
      frontmatter: { state: "done", links: { implements: ["RQ-0001"] } },
    },
    {
      id: "ST-0002",
      type: "Story",
      frontmatter: { state: "building", links: { implements: ["RQ-0001"] } },
    },
    {
      id: "ST-0003",
      type: "Story",
      frontmatter: { state: "draft", links: { implements: ["RQ-0001"] } },
    },
    {
      id: "TC-0001",
      type: "TestCase",
      frontmatter: { state: "active", links: { verifies: ["RQ-0001"] } },
    },
    {
      id: "TC-0002",
      type: "TestCase",
      frontmatter: { state: "retired", links: { verifies: ["RQ-0001"] } },
    },
    {
      id: "TC-0003",
      type: "TestCase",
      frontmatter: { state: "active", links: { verifies: ["ST-0001"] } },
    },
    {
      id: "ST-0099",
      type: "Story",
      frontmatter: { state: "done", links: { implements: ["RQ-9999"] } },
    },
  ]);
}

describe("computeChangeImpact", () => {
  it("computes correct forward+backward sets and classifies the backward set", () => {
    const registry = buildRegistry();
    const graph = buildGraph();

    const report = computeChangeImpact(graph, registry, {
      artifactId: "RQ-0001",
      before: "old requirement text",
      after: "new requirement text",
    });

    expect(report.edit).toEqual({
      artifactId: "RQ-0001",
      before: "old requirement text",
      after: "new requirement text",
    });

    // Forward: RQ-0001's own upstream context (traces_to).
    expect(report.raw.forward).toEqual(new Set(["PB-0001"]));

    // Backward: everything that transitively links up to RQ-0001, including TC-0003
    // two hops back via ST-0001 — proving this isn't just direct incoming edges.
    expect(report.raw.backward).toEqual(
      new Set(["ST-0001", "ST-0002", "ST-0003", "TC-0001", "TC-0002", "TC-0003"]),
    );
    expect(report.raw.backward.has("ST-0099")).toBe(false);

    expect(report.completedStories.map((a) => a.id)).toEqual(["ST-0001"]);
    expect(report.inFlightWork.map((a) => a.id)).toEqual(["ST-0002"]);
    expect(report.testCasesNeedingRevision.map((a) => a.id).sort()).toEqual([
      "TC-0001",
      "TC-0003",
    ]);
    expect(report.otherAffected.map((a) => a.id).sort()).toEqual(["ST-0003", "TC-0002"]);

    // Every classified artifact carries its type and state through.
    expect(report.completedStories[0]).toEqual({ id: "ST-0001", type: "Story", state: "done" });
  });

  it("returns empty buckets for an artifact nothing links to", () => {
    const registry = buildRegistry();
    const graph = new ArtifactGraph([
      { id: "RQ-0001", type: "Requirement", frontmatter: { state: "draft" } },
    ]);

    const report = computeChangeImpact(graph, registry, { artifactId: "RQ-0001" });

    expect(report.raw.forward).toEqual(new Set());
    expect(report.raw.backward).toEqual(new Set());
    expect(report.completedStories).toEqual([]);
    expect(report.inFlightWork).toEqual([]);
    expect(report.testCasesNeedingRevision).toEqual([]);
    expect(report.otherAffected).toEqual([]);
  });
});
