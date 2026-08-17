import { describe, expect, it } from "vitest";
import { ArtifactGraph, type GraphArtifact } from "../graph/graph.js";
import { myQueue, teamsForUser } from "./queue.js";

function artifact(
  id: string,
  type: string,
  frontmatter: Record<string, unknown> = {},
): GraphArtifact {
  return { id, type, frontmatter };
}

describe("myQueue", () => {
  it("includes artifacts owned by the user", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { owner: "US-0001" }),
      artifact("ST-0002", "Story", { owner: "US-0002" }),
    ]);
    expect(myQueue(graph, "US-0001")).toEqual([
      { artifactId: "ST-0001", type: "Story", reasons: ["owner"] },
    ]);
  });

  it("includes artifacts assigned to the user", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { owner: "US-9999", assignee: "US-0001" }),
    ]);
    expect(myQueue(graph, "US-0001")).toEqual([
      { artifactId: "ST-0001", type: "Story", reasons: ["assignee"] },
    ]);
  });

  it("includes artifacts with a pending claim by the user", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", {
        owner: "US-9999",
        claim: { by: "US-0001", machine: "srinis-mbp", at: "2026-08-14T09:15:02Z" },
      }),
    ]);
    expect(myQueue(graph, "US-0001")).toEqual([
      { artifactId: "ST-0001", type: "Story", reasons: ["claim"] },
    ]);
  });

  it("collects every matching reason on one artifact, in owner/assignee/claim order", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", {
        owner: "US-0001",
        assignee: "US-0001",
        claim: { by: "US-0001", machine: "m", at: "2026-08-14T09:15:02Z" },
      }),
    ]);
    expect(myQueue(graph, "US-0001")).toEqual([
      { artifactId: "ST-0001", type: "Story", reasons: ["owner", "assignee", "claim"] },
    ]);
  });

  it("matches case-insensitively and reports the canonical uppercase artifact ID", () => {
    const graph = new ArtifactGraph([artifact("st-0001", "Story", { owner: "us-0001" })]);
    expect(myQueue(graph, "us-0001")).toEqual([
      { artifactId: "ST-0001", type: "Story", reasons: ["owner"] },
    ]);
  });

  it("a claim never matches a team ID — claim.by is always a single user", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", {
        claim: { by: "US-0002", machine: "m", at: "2026-08-14T09:15:02Z" },
      }),
    ]);
    expect(myQueue(graph, "US-0001", { teamIds: ["TM-0001"] })).toEqual([]);
  });

  it("includes artifacts owned/assigned to a team the user belongs to (explicit teamIds)", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { owner: "TM-0001" }),
      artifact("ST-0002", "Story", { assignee: "TM-0002" }),
      artifact("ST-0003", "Story", { owner: "TM-0003" }),
    ]);
    expect(myQueue(graph, "US-0001", { teamIds: ["TM-0001", "TM-0002"] })).toEqual([
      { artifactId: "ST-0001", type: "Story", reasons: ["owner"] },
      { artifactId: "ST-0002", type: "Story", reasons: ["assignee"] },
    ]);
  });

  it("returns nothing for a user with no owned/assigned/claimed artifacts", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story", { owner: "US-9999" })]);
    expect(myQueue(graph, "US-0001")).toEqual([]);
  });

  it("is ID-sorted, matching ArtifactGraph.allArtifacts() order", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0002", "Story", { owner: "US-0001" }),
      artifact("ST-0001", "Story", { owner: "US-0001" }),
    ]);
    expect(myQueue(graph, "US-0001").map((e) => e.artifactId)).toEqual(["ST-0001", "ST-0002"]);
  });
});

describe("teamsForUser", () => {
  it("finds every Team whose members include the user, sorted", () => {
    const graph = new ArtifactGraph([
      artifact("TM-0002", "Team", { members: ["US-0001", "US-0002"] }),
      artifact("TM-0001", "Team", { members: ["US-0001"] }),
      artifact("TM-0003", "Team", { members: ["US-0002"] }),
    ]);
    expect(teamsForUser(graph, "US-0001")).toEqual(["TM-0001", "TM-0002"]);
  });

  it("returns nothing for a user on no team", () => {
    const graph = new ArtifactGraph([artifact("TM-0001", "Team", { members: ["US-0002"] })]);
    expect(teamsForUser(graph, "US-0001")).toEqual([]);
  });

  it("ignores non-Team artifacts and malformed members fields", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { members: ["US-0001"] }), // wrong type — ignored
      artifact("TM-0001", "Team", { members: "US-0001" }), // malformed — ignored
    ]);
    expect(teamsForUser(graph, "US-0001")).toEqual([]);
  });

  it("composes with myQueue to include team-owned work", () => {
    const graph = new ArtifactGraph([
      artifact("TM-0001", "Team", { members: ["US-0001"] }),
      artifact("ST-0001", "Story", { owner: "TM-0001" }),
    ]);
    const teamIds = teamsForUser(graph, "US-0001");
    expect(myQueue(graph, "US-0001", { teamIds })).toEqual([
      { artifactId: "ST-0001", type: "Story", reasons: ["owner"] },
    ]);
  });
});
