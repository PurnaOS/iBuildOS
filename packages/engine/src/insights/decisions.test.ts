import { describe, expect, it } from "vitest";
import { ArtifactGraph, type GraphArtifact } from "../graph/graph.js";
import { constrainedArtifacts, constrainingDecisions, supersessionHistory } from "./decisions.js";

function artifact(id: string, type: string, frontmatter: Record<string, unknown> = {}): GraphArtifact {
  return { id, type, frontmatter };
}

describe("constrainedArtifacts / constrainingDecisions", () => {
  it("finds what a Decision constrains and the inverse lookup agrees", () => {
    const graph = new ArtifactGraph([
      artifact("DC-0001", "Decision", { links: { constrains: ["RQ-0001", "ST-0001"] } }),
      artifact("RQ-0001", "Requirement"),
      artifact("ST-0001", "Story"),
    ]);

    expect(constrainedArtifacts(graph, "DC-0001")).toEqual(["RQ-0001", "ST-0001"]);
    expect(constrainingDecisions(graph, "RQ-0001")).toEqual(["DC-0001"]);
    expect(constrainingDecisions(graph, "ST-0001")).toEqual(["DC-0001"]);
  });

  it("returns [] when a Decision constrains nothing, and for an unconstrained artifact", () => {
    const graph = new ArtifactGraph([artifact("DC-0001", "Decision"), artifact("RQ-0001", "Requirement")]);

    expect(constrainedArtifacts(graph, "DC-0001")).toEqual([]);
    expect(constrainingDecisions(graph, "RQ-0001")).toEqual([]);
  });

  it("dedupes multiple decisions constraining the same artifact, sorted", () => {
    const graph = new ArtifactGraph([
      artifact("DC-0002", "Decision", { links: { constrains: ["RQ-0001"] } }),
      artifact("DC-0001", "Decision", { links: { constrains: ["RQ-0001"] } }),
      artifact("RQ-0001", "Requirement"),
    ]);

    expect(constrainingDecisions(graph, "RQ-0001")).toEqual(["DC-0001", "DC-0002"]);
  });
});

describe("supersessionHistory", () => {
  it("walks a multi-hop supersedes chain in both directions", () => {
    // DC-0001 <-supersedes- DC-0002 <-supersedes- DC-0003
    // (DC-0002 supersedes DC-0001; DC-0003 supersedes DC-0002)
    const graph = new ArtifactGraph([
      artifact("DC-0001", "Decision"),
      artifact("DC-0002", "Decision", { links: { supersedes: ["DC-0001"] } }),
      artifact("DC-0003", "Decision", { links: { supersedes: ["DC-0002"] } }),
    ]);

    expect(supersessionHistory(graph, "DC-0002")).toEqual({
      supersedes: ["DC-0001"],
      supersededBy: ["DC-0003"],
    });
    expect(supersessionHistory(graph, "DC-0003")).toEqual({
      supersedes: ["DC-0001", "DC-0002"],
      supersededBy: [],
    });
    expect(supersessionHistory(graph, "DC-0001")).toEqual({
      supersedes: [],
      supersededBy: ["DC-0002", "DC-0003"],
    });
  });

  it("works for Requirement -> Requirement supersession too, not just Decision", () => {
    const graph = new ArtifactGraph([
      artifact("RQ-0001", "Requirement"),
      artifact("RQ-0002", "Requirement", { links: { supersedes: ["RQ-0001"] } }),
    ]);

    expect(supersessionHistory(graph, "RQ-0002").supersedes).toEqual(["RQ-0001"]);
  });

  it("returns empty history for an artifact with no supersession links at all", () => {
    const graph = new ArtifactGraph([artifact("DC-0001", "Decision")]);

    expect(supersessionHistory(graph, "DC-0001")).toEqual({ supersedes: [], supersededBy: [] });
  });
});
