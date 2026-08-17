import { describe, expect, it } from "vitest";
import { ArtifactGraph, baseArtifactId, type GraphArtifact } from "./graph.js";

function artifact(id: string, type: string, links?: Record<string, string[]>): GraphArtifact {
  return { id, type, frontmatter: links ? { links } : {} };
}

describe("baseArtifactId", () => {
  it("strips a criterion ref down to the base artifact ID", () => {
    expect(baseArtifactId("ST-0042#AC-2")).toBe("ST-0042");
  });

  it("uppercases plain IDs and criterion refs alike", () => {
    expect(baseArtifactId("st-0042")).toBe("ST-0042");
    expect(baseArtifactId("st-0042#ac-2")).toBe("ST-0042");
  });
});

describe("ArtifactGraph", () => {
  it("normalizes ID case at insert and lookup (FORMATS §2)", () => {
    const graph = new ArtifactGraph([artifact("st-0001", "Story")]);
    expect(graph.has("ST-0001")).toBe(true);
    expect(graph.has("st-0001")).toBe(true);
    expect(graph.get("St-0001")?.id).toBe("ST-0001");
  });

  it("has()/get() reflect bundle membership", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story")]);
    expect(graph.has("ST-0001")).toBe(true);
    expect(graph.has("ST-9999")).toBe(false);
    expect(graph.get("ST-9999")).toBeUndefined();
  });

  it("allIds/allArtifacts are sorted", () => {
    const graph = new ArtifactGraph([artifact("ST-0002", "Story"), artifact("ST-0001", "Story")]);
    expect(graph.allIds()).toEqual(["ST-0001", "ST-0002"]);
    expect(graph.allArtifacts().map((a) => a.id)).toEqual(["ST-0001", "ST-0002"]);
  });

  it("idsOfType filters by exact type", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story"),
      artifact("RQ-0001", "Requirement"),
    ]);
    expect(graph.idsOfType("Story")).toEqual(["ST-0001"]);
  });

  it("outgoing/incoming derive edges from frontmatter.links, keyed by relationship", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { implements: ["RQ-0001"], depends_on: ["ST-0002"] }),
      artifact("RQ-0001", "Requirement"),
      artifact("ST-0002", "Story"),
    ]);

    const out = graph.outgoing("ST-0001");
    expect(out).toHaveLength(2);
    expect(graph.outgoing("ST-0001", "implements")).toEqual([
      { from: "ST-0001", relationship: "implements", target: "RQ-0001", targetId: "RQ-0001" },
    ]);

    expect(graph.incoming("RQ-0001", "implements").map((e) => e.from)).toEqual(["ST-0001"]);
    expect(graph.incoming("RQ-0001", "depends_on")).toEqual([]);
  });

  it("resolves a criterion-ref target to its base artifact ID as the edge's targetId", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { verified_by: ["TC-0001#AC-1"] }),
      artifact("TC-0001", "TestCase"),
    ]);
    expect(graph.outgoing("ST-0001", "verified_by")).toEqual([
      {
        from: "ST-0001",
        relationship: "verified_by",
        target: "TC-0001#AC-1",
        targetId: "TC-0001",
      },
    ]);
    expect(graph.incoming("TC-0001").map((e) => e.from)).toEqual(["ST-0001"]);
  });

  it("edgesByRelationship collects across every source artifact", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { depends_on: ["ST-0002"] }),
      artifact("ST-0002", "Story", { depends_on: ["ST-0003"] }),
      artifact("ST-0003", "Story"),
    ]);
    expect(graph.edgesByRelationship("depends_on").map((e) => `${e.from}->${e.targetId}`)).toEqual(
      ["ST-0001->ST-0002", "ST-0002->ST-0003"],
    );
  });

  it("ignores malformed links shapes (not an array) rather than throwing", () => {
    const graph = new ArtifactGraph([
      { id: "ST-0001", type: "Story", frontmatter: { links: { implements: "RQ-0001" } } },
    ]);
    expect(graph.outgoing("ST-0001")).toEqual([]);
  });
});
