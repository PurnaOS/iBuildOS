import { describe, expect, it } from "vitest";
import { ProfileRegistry } from "../profile/registry.js";
import { ArtifactGraph } from "../graph/graph.js";
import { checkRetiredReferenced, checkUnrecordedChange } from "./drift.js";

// Minimal, self-contained profile for this module's fixtures (no file I/O — mirrors
// rules/chain.test.ts's inline-TypeDefinition pattern).
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
defines: Requirement
abstract: false
prefix: RQ
fields: {}
links:
  supersedes: { target: [Requirement] }
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
    `---
type: TypeDefinition
defines: Change
abstract: false
prefix: CH
fields: {}
links:
  affects: { target: [Requirement, Story] }
body: { sections: [] }
---
`,
  ]);
}

describe("drift/retired-referenced", () => {
  it("flags a non-retired referencer of a retired requirement, and of a superseded one — but not a retired referencer", () => {
    const graph = new ArtifactGraph([
      { id: "RQ-0001", type: "Requirement", frontmatter: { state: "retired" } },
      {
        id: "ST-0001",
        type: "Story",
        frontmatter: { state: "building", links: { implements: ["RQ-0001"] } },
      },
      {
        // a retired Story referencing a retired Requirement isn't new drift.
        id: "ST-0003",
        type: "Story",
        frontmatter: { state: "retired", links: { implements: ["RQ-0001"] } },
      },
      { id: "RQ-0002", type: "Requirement", frontmatter: { state: "active" } },
      {
        id: "RQ-0003",
        type: "Requirement",
        frontmatter: { state: "ready", links: { supersedes: ["RQ-0002"] } },
      },
      {
        id: "TC-0001",
        type: "TestCase",
        frontmatter: { state: "active", links: { verifies: ["RQ-0002"] } },
      },
      { id: "RQ-0004", type: "Requirement", frontmatter: { state: "active" } },
      {
        id: "ST-0002",
        type: "Story",
        frontmatter: { state: "building", links: { implements: ["RQ-0004"] } },
      },
    ]);

    const findings = checkRetiredReferenced(graph);

    expect(findings).toEqual([
      expect.objectContaining({
        rule: "drift/retired-referenced",
        severity: "warn",
        artifact: "ST-0001",
        subject: "RQ-0001",
      }),
      expect.objectContaining({
        rule: "drift/retired-referenced",
        severity: "warn",
        artifact: "TC-0001",
        subject: "RQ-0002",
      }),
    ]);
  });

  it("passes on a clean graph — nothing retired or superseded", () => {
    const graph = new ArtifactGraph([
      { id: "RQ-0001", type: "Requirement", frontmatter: { state: "ready" } },
      {
        id: "ST-0001",
        type: "Story",
        frontmatter: { state: "building", links: { implements: ["RQ-0001"] } },
      },
    ]);
    expect(checkRetiredReferenced(graph)).toEqual([]);
  });
});

describe("drift/unrecorded-change", () => {
  it("flags done/accepted work against a retired requirement with no recorded Change, and no others", () => {
    const registry = buildRegistry();
    const graph = new ArtifactGraph([
      // red: no Change records this at all.
      { id: "RQ-0010", type: "Requirement", frontmatter: { state: "retired" } },
      {
        id: "ST-0010",
        type: "Story",
        frontmatter: { state: "done", links: { implements: ["RQ-0010"] } },
      },

      // green: a Change affects the Story directly.
      { id: "RQ-0011", type: "Requirement", frontmatter: { state: "retired" } },
      {
        id: "ST-0011",
        type: "Story",
        frontmatter: { state: "done", links: { implements: ["RQ-0011"] } },
      },
      {
        id: "CH-0001",
        type: "Change",
        frontmatter: { state: "applied", links: { affects: ["ST-0011"] } },
      },

      // green: a Change affects the Requirement instead.
      { id: "RQ-0012", type: "Requirement", frontmatter: { state: "retired" } },
      {
        id: "ST-0012",
        type: "Story",
        frontmatter: { state: "accepted", links: { implements: ["RQ-0012"] } },
      },
      {
        id: "CH-0002",
        type: "Change",
        frontmatter: { state: "applied", links: { affects: ["RQ-0012"] } },
      },

      // green: the Story isn't done/accepted yet.
      { id: "RQ-0013", type: "Requirement", frontmatter: { state: "retired" } },
      {
        id: "ST-0013",
        type: "Story",
        frontmatter: { state: "building", links: { implements: ["RQ-0013"] } },
      },

      // green: the requirement hasn't moved.
      { id: "RQ-0014", type: "Requirement", frontmatter: { state: "ready" } },
      {
        id: "ST-0014",
        type: "Story",
        frontmatter: { state: "done", links: { implements: ["RQ-0014"] } },
      },
    ]);

    const findings = checkUnrecordedChange(graph, registry);

    expect(findings).toEqual([
      expect.objectContaining({
        rule: "drift/unrecorded-change",
        severity: "warn",
        artifact: "ST-0010",
        subject: "RQ-0010",
      }),
    ]);
  });

  it("passes on a clean graph — nothing done/accepted against a moved requirement", () => {
    const registry = buildRegistry();
    const graph = new ArtifactGraph([
      { id: "RQ-0001", type: "Requirement", frontmatter: { state: "ready" } },
      {
        id: "ST-0001",
        type: "Story",
        frontmatter: { state: "done", links: { implements: ["RQ-0001"] } },
      },
    ]);
    expect(checkUnrecordedChange(graph, registry)).toEqual([]);
  });
});
