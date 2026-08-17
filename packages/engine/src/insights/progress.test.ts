import { describe, expect, it } from "vitest";
import { ArtifactGraph, type GraphArtifact } from "../graph/graph.js";
import { DEFAULT_COMPLETED_STATES, progress } from "./progress.js";

function artifact(id: string, type: string, frontmatter: Record<string, unknown> = {}): GraphArtifact {
  return { id, type, frontmatter };
}

describe("progress", () => {
  it("crosstabs type x state and splits completed/pending using DEFAULT_COMPLETED_STATES", () => {
    const graph = new ArtifactGraph([
      artifact("RQ-0001", "Requirement", { state: "verified" }),
      artifact("RQ-0002", "Requirement", { state: "draft" }),
      artifact("ST-0001", "Story", { state: "done" }),
      artifact("ST-0002", "Story", { state: "building" }),
      artifact("ST-0003", "Story", { state: "done" }),
    ]);

    const summary = progress(graph);

    expect(summary.total).toBe(5);
    expect(summary.byType).toEqual({ Requirement: 2, Story: 3 });
    expect(summary.byState).toEqual({ verified: 1, draft: 1, done: 2, building: 1 });
    expect(summary.byTypeAndState).toEqual([
      { type: "Requirement", state: "draft", count: 1 },
      { type: "Requirement", state: "verified", count: 1 },
      { type: "Story", state: "building", count: 1 },
      { type: "Story", state: "done", count: 2 },
    ]);
    expect(summary.completedByType).toEqual({ Requirement: 1, Story: 2 });
    expect(summary.pendingByType).toEqual({ Requirement: 1, Story: 1 });
  });

  it("reads frontmatter.state, not frontmatter.status — a status-only artifact counts as no-state", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story", { status: "done" })]);

    const summary = progress(graph);

    expect(summary.byState).toEqual({ "(no state)": 1 });
    expect(summary.completedByType).toEqual({});
    expect(summary.pendingByType).toEqual({ Story: 1 });
  });

  it("honors a caller-supplied completedStates override instead of the default", () => {
    const graph = new ArtifactGraph([
      artifact("DC-0001", "Decision", { state: "accepted" }),
      artifact("DC-0002", "Decision", { state: "proposed" }),
    ]);

    const summary = progress(graph, new Set(["proposed"]));

    expect(summary.completedByType).toEqual({ Decision: 1 });
    expect(summary.pendingByType).toEqual({ Decision: 1 });
  });

  it("DEFAULT_COMPLETED_STATES covers the shipped profile's done/verified/accepted convention", () => {
    expect(DEFAULT_COMPLETED_STATES.has("done")).toBe(true);
    expect(DEFAULT_COMPLETED_STATES.has("verified")).toBe(true);
    expect(DEFAULT_COMPLETED_STATES.has("accepted")).toBe(true);
    expect(DEFAULT_COMPLETED_STATES.has("retired")).toBe(false);
  });

  it("returns all-zero shape on an empty artifact set", () => {
    const graph = new ArtifactGraph([]);

    const summary = progress(graph);

    expect(summary).toEqual({
      total: 0,
      byType: {},
      byState: {},
      byTypeAndState: [],
      completedByType: {},
      pendingByType: {},
    });
  });
});
