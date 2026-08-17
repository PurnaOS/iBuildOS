import { describe, expect, it } from "vitest";
import { ArtifactGraph, type GraphArtifact } from "../graph/graph.js";
import { workload } from "./workload.js";

function artifact(id: string, type: string, frontmatter: Record<string, unknown> = {}): GraphArtifact {
  return { id, type, frontmatter };
}

describe("workload", () => {
  it("counts owned and assigned artifacts per user, with sorted artifact ID lists", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { owner: "US-0001", assignee: "US-0002" }),
      artifact("ST-0002", "Story", { owner: "US-0001", assignee: "US-0002" }),
      artifact("TA-0001", "Task", { owner: "US-0003", assignee: "US-0001" }),
    ]);

    const result = workload(graph);

    expect(result).toEqual([
      { id: "US-0001", role: "owner", count: 2, artifactIds: ["ST-0001", "ST-0002"] },
      { id: "US-0003", role: "owner", count: 1, artifactIds: ["TA-0001"] },
      { id: "US-0001", role: "assignee", count: 1, artifactIds: ["TA-0001"] },
      { id: "US-0002", role: "assignee", count: 2, artifactIds: ["ST-0001", "ST-0002"] },
    ]);
  });

  it("supports team assignment as well as user assignment (same free-form ID field)", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story", { owner: "US-0001", assignee: "TM-0001" })]);

    const result = workload(graph);

    expect(result).toContainEqual({ id: "TM-0001", role: "assignee", count: 1, artifactIds: ["ST-0001"] });
  });

  it("a user with zero assignments does not appear unless explicitly requested via identities", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story", { owner: "US-0001", assignee: "US-0001" })]);

    expect(workload(graph).some((entry) => entry.id === "US-0099")).toBe(false);

    const withIdentities = workload(graph, { identities: ["US-0099"] });
    expect(withIdentities).toContainEqual({ id: "US-0099", role: "owner", count: 0, artifactIds: [] });
    expect(withIdentities).toContainEqual({ id: "US-0099", role: "assignee", count: 0, artifactIds: [] });
  });

  it("ignores artifacts with no owner/assignee field and returns [] on an empty graph", () => {
    const graph = new ArtifactGraph([artifact("PB-0001", "ProductBrief")]);

    expect(workload(graph)).toEqual([]);
    expect(workload(new ArtifactGraph([]))).toEqual([]);
  });
});
