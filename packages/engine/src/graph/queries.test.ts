import { describe, expect, it } from "vitest";
import { ProfileRegistry } from "../profile/registry.js";
import { ArtifactGraph, type GraphArtifact } from "./graph.js";
import { artifactsSatisfying, findCycles, impact, reachable, whoLinksTo } from "./queries.js";

function artifact(id: string, type: string, links?: Record<string, string[]>): GraphArtifact {
  return { id, type, frontmatter: links ? { links } : {} };
}

// A -> B -> C (depends_on), D -> A (implements) — enough shape to exercise
// forward/backward reachability and reverse lookups without needing a full
// type profile.
function chainGraph(): ArtifactGraph {
  return new ArtifactGraph([
    artifact("A", "Story", { depends_on: ["B"] }),
    artifact("B", "Story", { depends_on: ["C"] }),
    artifact("C", "Story"),
    artifact("D", "Story", { implements: ["A"] }),
  ]);
}

describe("reachable / impact", () => {
  it("forward reachability follows outgoing edges transitively", () => {
    const graph = chainGraph();
    expect(reachable(graph, "A", "forward", "depends_on")).toEqual(new Set(["B", "C"]));
  });

  it("backward reachability follows incoming edges transitively", () => {
    const graph = chainGraph();
    expect(reachable(graph, "C", "backward", "depends_on")).toEqual(new Set(["B", "A"]));
  });

  it("never includes the starting node itself, even in a cycle", () => {
    const graph = new ArtifactGraph([
      artifact("A", "Story", { depends_on: ["B"] }),
      artifact("B", "Story", { depends_on: ["A"] }),
    ]);
    expect(reachable(graph, "A", "forward", "depends_on")).toEqual(new Set(["B"]));
  });

  it("impact() combines forward and backward", () => {
    const graph = chainGraph();
    const result = impact(graph, "A", "depends_on");
    expect(result.forward).toEqual(new Set(["B", "C"]));
    expect(result.backward).toEqual(new Set());
  });
});

describe("whoLinksTo", () => {
  it("returns distinct, sorted source IDs", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0002", "Story", { implements: ["RQ-0001"] }),
      artifact("ST-0001", "Story", { implements: ["RQ-0001"] }),
      artifact("RQ-0001", "Requirement"),
    ]);
    expect(whoLinksTo(graph, "RQ-0001", "implements")).toEqual(["ST-0001", "ST-0002"]);
  });
});

describe("artifactsSatisfying", () => {
  const workItem = `---
type: TypeDefinition
defines: WorkItem
abstract: true
fields: {}
links: {}
body: { sections: [] }
---
`;
  const story = `---
type: TypeDefinition
defines: Story
extends: WorkItem
abstract: false
prefix: ST
fields: {}
links: {}
body: { sections: [] }
---
`;

  it("is polymorphic — a Story satisfies WorkItem", () => {
    const registry = ProfileRegistry.fromRawDocuments([workItem, story]);
    const graph = new ArtifactGraph([artifact("ST-0001", "Story"), artifact("XX-0001", "Widget")]);
    expect(artifactsSatisfying(graph, registry, "WorkItem").map((a) => a.id)).toEqual(["ST-0001"]);
  });

  it("tolerates artifacts whose type isn't in the registry (KB-008)", () => {
    const registry = ProfileRegistry.fromRawDocuments([workItem, story]);
    const graph = new ArtifactGraph([artifact("XX-0001", "Widget")]);
    expect(() => artifactsSatisfying(graph, registry, "WorkItem")).not.toThrow();
    expect(artifactsSatisfying(graph, registry, "WorkItem")).toEqual([]);
  });
});

describe("findCycles", () => {
  it("finds no cycles in an acyclic relationship", () => {
    const graph = chainGraph();
    expect(findCycles(graph, "depends_on")).toEqual([]);
  });

  it("finds a two-node cycle", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { depends_on: ["ST-0002"] }),
      artifact("ST-0002", "Story", { depends_on: ["ST-0001"] }),
    ]);
    expect(findCycles(graph, "depends_on")).toEqual([["ST-0001", "ST-0002"]]);
  });

  it("finds a self-loop as a one-node cycle", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story", { depends_on: ["ST-0001"] })]);
    expect(findCycles(graph, "depends_on")).toEqual([["ST-0001"]]);
  });

  it("excludes dangling edges from cycle detection", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story", { depends_on: ["ST-9999"] })]);
    expect(findCycles(graph, "depends_on")).toEqual([]);
  });

  it("reports multiple disjoint cycles, sorted by their smallest member", () => {
    const graph = new ArtifactGraph([
      artifact("B-1", "Story", { depends_on: ["B-2"] }),
      artifact("B-2", "Story", { depends_on: ["B-1"] }),
      artifact("A-1", "Story", { depends_on: ["A-2"] }),
      artifact("A-2", "Story", { depends_on: ["A-1"] }),
    ]);
    expect(findCycles(graph, "depends_on")).toEqual([
      ["A-1", "A-2"],
      ["B-1", "B-2"],
    ]);
  });
});
