import { describe, expect, it } from "vitest";
import { ArtifactGraph, type GraphArtifact } from "../graph/graph.js";
import { ProfileRegistry } from "../profile/registry.js";
import { coverageFor, coverageMatrix, verifyingTestCaseIds } from "./coverage.js";

function artifact(id: string, type: string, frontmatter: Record<string, unknown> = {}): GraphArtifact {
  return { id, type, frontmatter };
}

describe("verifyingTestCaseIds", () => {
  it("unions outgoing verified_by (Story) and incoming verifies (Requirement)", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { links: { verified_by: ["TC-0001"] } }),
      artifact("RQ-0001", "Requirement"),
      artifact("TC-0001", "TestCase", { links: { verifies: ["RQ-0001"] } }),
      artifact("TC-0002", "TestCase", { links: { verifies: ["RQ-0001#AC-1"] } }),
    ]);

    expect(verifyingTestCaseIds(graph, "ST-0001")).toEqual(["TC-0001"]);
    // criterion refs (#AC-n) roll up to the base Requirement ID for free.
    expect(verifyingTestCaseIds(graph, "RQ-0001")).toEqual(["TC-0001", "TC-0002"]);
  });

  it("returns [] for an artifact nothing verifies", () => {
    const graph = new ArtifactGraph([artifact("RQ-0002", "Requirement")]);
    expect(verifyingTestCaseIds(graph, "RQ-0002")).toEqual([]);
  });
});

describe("coverageFor", () => {
  it("is 'covered' when a linked TestCase has a passing TestResult (Story via verified_by)", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { links: { verified_by: ["TC-0001"] } }),
      artifact("TC-0001", "TestCase"),
      artifact("TR-0001", "TestResult", { subject: "TC-0001", verdict: "pass" }),
    ]);

    const entry = coverageFor(graph, "ST-0001");

    expect(entry).toEqual({
      artifactId: "ST-0001",
      testCaseIds: ["TC-0001"],
      evidence: [{ testCaseId: "TC-0001", hasResult: true, hasPassingResult: true }],
      status: "covered",
    });
  });

  it("is 'covered' for a Requirement via the incoming verifies direction (no verified_by on Requirement)", () => {
    const graph = new ArtifactGraph([
      artifact("RQ-0001", "Requirement"),
      artifact("TC-0001", "TestCase", { links: { verifies: ["RQ-0001"] } }),
      artifact("TR-0001", "TestResult", { subject: "TC-0001", verdict: "pass" }),
    ]);

    expect(coverageFor(graph, "RQ-0001").status).toBe("covered");
  });

  it("is 'failing' when the only recorded result is not passing", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { links: { verified_by: ["TC-0001"] } }),
      artifact("TC-0001", "TestCase"),
      artifact("TR-0001", "TestResult", { subject: "TC-0001", verdict: "fail" }),
    ]);

    const entry = coverageFor(graph, "ST-0001");
    expect(entry.status).toBe("failing");
    expect(entry.evidence).toEqual([{ testCaseId: "TC-0001", hasResult: true, hasPassingResult: false }]);
  });

  it("is 'failing' for a Requirement too, via the incoming verifies direction", () => {
    const graph = new ArtifactGraph([
      artifact("RQ-0001", "Requirement"),
      artifact("TC-0001", "TestCase", { links: { verifies: ["RQ-0001"] } }),
      artifact("TR-0001", "TestResult", { subject: "TC-0001", verdict: "fail" }),
    ]);

    const entry = coverageFor(graph, "RQ-0001");
    expect(entry.status).toBe("failing");
    expect(entry.testCaseIds).toEqual(["TC-0001"]);
  });

  it("is 'missing-result' for a Requirement with a linked but never-run TestCase", () => {
    const graph = new ArtifactGraph([
      artifact("RQ-0001", "Requirement"),
      artifact("TC-0001", "TestCase", { links: { verifies: ["RQ-0001"] } }),
    ]);

    const entry = coverageFor(graph, "RQ-0001");
    expect(entry.status).toBe("missing-result");
  });

  it("is 'missing-result' when a TestCase is linked but has never been run", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { links: { verified_by: ["TC-0001"] } }),
      artifact("TC-0001", "TestCase"),
    ]);

    const entry = coverageFor(graph, "ST-0001");
    expect(entry.status).toBe("missing-result");
    expect(entry.evidence).toEqual([{ testCaseId: "TC-0001", hasResult: false, hasPassingResult: false }]);
  });

  it("is 'uncovered' when nothing verifies the artifact at all", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story")]);

    const entry = coverageFor(graph, "ST-0001");
    expect(entry).toEqual({ artifactId: "ST-0001", testCaseIds: [], evidence: [], status: "uncovered" });
  });

  it("counts as 'covered' if ANY linked TestCase passes, even if others are failing — matching chain/story-untested", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { links: { verified_by: ["TC-0001", "TC-0002"] } }),
      artifact("TC-0001", "TestCase"),
      artifact("TC-0002", "TestCase"),
      artifact("TR-0001", "TestResult", { subject: "TC-0001", verdict: "fail" }),
      artifact("TR-0002", "TestResult", { subject: "TC-0002", verdict: "pass" }),
    ]);

    expect(coverageFor(graph, "ST-0001").status).toBe("covered");
  });

  it("honors a ProfileRegistry when supplied, instead of duck-typing TestResult", () => {
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
    const testResult = `---
type: TypeDefinition
defines: TestResult
abstract: false
prefix: TR
fields: {}
links: {}
body: { sections: [] }
---
`;
    const registry = ProfileRegistry.fromRawDocuments([workItem, story, testResult]);

    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { links: { verified_by: ["TC-0001"] } }),
      artifact("TC-0001", "TestCase"),
      artifact("TR-0001", "TestResult", { subject: "TC-0001", verdict: "pass" }),
    ]);

    expect(coverageFor(graph, "ST-0001", registry).status).toBe("covered");
  });

  it("normalizes a lowercase id to canonical uppercase (FORMATS §2), like the graph itself", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { links: { verified_by: ["TC-0001"] } }),
      artifact("TC-0001", "TestCase"),
      artifact("TR-0001", "TestResult", { subject: "TC-0001", verdict: "pass" }),
    ]);

    const entry = coverageFor(graph, "st-0001");
    expect(entry.artifactId).toBe("ST-0001");
    expect(entry.status).toBe("covered");
  });
});

describe("coverageMatrix", () => {
  it("maps coverageFor over a set of IDs, sorted by artifact ID", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0002", "Story"),
      artifact("ST-0001", "Story", { links: { verified_by: ["TC-0001"] } }),
      artifact("TC-0001", "TestCase"),
      artifact("TR-0001", "TestResult", { subject: "TC-0001", verdict: "pass" }),
    ]);

    const matrix = coverageMatrix(graph, ["ST-0002", "ST-0001"]);

    expect(matrix.map((e) => e.artifactId)).toEqual(["ST-0001", "ST-0002"]);
    expect(matrix[0]!.status).toBe("covered");
    expect(matrix[1]!.status).toBe("uncovered");
  });

  it("normalizes case and dedupes before sorting, so mixed-case input doesn't produce duplicate rows", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story")]);

    const matrix = coverageMatrix(graph, ["st-0001", "ST-0001"]);

    expect(matrix).toHaveLength(1);
    expect(matrix[0]!.artifactId).toBe("ST-0001");
  });

  it("returns [] for an empty ID list", () => {
    expect(coverageMatrix(new ArtifactGraph([]), [])).toEqual([]);
  });
});
