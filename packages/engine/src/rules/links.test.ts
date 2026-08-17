import { describe, expect, it } from "vitest";
import { parseOkfDocument } from "../store/okf-document.js";
import { ProfileRegistry } from "../profile/registry.js";
import { ArtifactGraph, type GraphArtifact } from "../graph/graph.js";
import { readFixture } from "../test-utils/fixtures.js";
import {
  checkLinkCardinality,
  checkLinkCycles,
  checkLinkTargetExists,
  checkLinkTargetType,
} from "./links.js";

// This module's own mini profile (fixtures/graph/profile/*) — a concrete
// Requirement and a Task with a `code` field, unlike the shared
// fixtures/profile/* set. See fixtures/graph/profile/work-item.md's body for
// why it's separate.
function buildRegistry(): ProfileRegistry {
  return ProfileRegistry.fromRawDocuments([
    readFixture("graph/profile/work-item.md"),
    readFixture("graph/profile/requirement.md"),
    readFixture("graph/profile/story.md"),
    readFixture("graph/profile/task.md"),
    readFixture("graph/profile/test-case.md"),
  ]);
}

function loadArtifact(path: string): GraphArtifact {
  const { frontmatter } = parseOkfDocument(readFixture(path));
  return {
    id: frontmatter.id as string,
    type: frontmatter.type as string,
    frontmatter,
  };
}

describe("link/target-exists", () => {
  it("green: implements resolves to a real artifact", () => {
    const graph = new ArtifactGraph([
      loadArtifact("graph/target-exists/green/st-0001.md"),
      loadArtifact("graph/target-exists/green/rq-0001.md"),
    ]);
    const { frontmatter } = parseOkfDocument(readFixture("graph/target-exists/green/st-0001.md"));
    expect(checkLinkTargetExists("ST-0001", frontmatter, graph)).toEqual([]);
  });

  it("red: implements points at an ID absent from the bundle", () => {
    const graph = new ArtifactGraph([loadArtifact("graph/target-exists/red/st-0001.md")]);
    const { frontmatter } = parseOkfDocument(readFixture("graph/target-exists/red/st-0001.md"));
    expect(checkLinkTargetExists("ST-0001", frontmatter, graph)).toEqual([
      expect.objectContaining({
        rule: "link/target-exists",
        severity: "error",
        artifact: "ST-0001",
        subject: "implements",
      }),
    ]);
  });

  it("resolves a criterion-ref target by its base artifact ID", () => {
    const graph = new ArtifactGraph([
      { id: "ST-0001", type: "Story", frontmatter: { links: { verified_by: ["TC-0001#AC-1"] } } },
      { id: "TC-0001", type: "TestCase", frontmatter: {} },
    ]);
    expect(
      checkLinkTargetExists("ST-0001", { links: { verified_by: ["TC-0001#AC-1"] } }, graph),
    ).toEqual([]);
  });
});

describe("link/target-type", () => {
  it("green: implements target is a Requirement", () => {
    const registry = buildRegistry();
    const type = registry.resolve("Story");
    const graph = new ArtifactGraph([
      loadArtifact("graph/target-type/green/st-0001.md"),
      loadArtifact("graph/target-type/green/rq-0001.md"),
    ]);
    const { frontmatter } = parseOkfDocument(readFixture("graph/target-type/green/st-0001.md"));
    expect(checkLinkTargetType("ST-0001", frontmatter, type, graph, registry)).toEqual([]);
  });

  it("red: implements target is a TestCase, not a Requirement", () => {
    const registry = buildRegistry();
    const type = registry.resolve("Story");
    const graph = new ArtifactGraph([
      loadArtifact("graph/target-type/red/st-0001.md"),
      loadArtifact("graph/target-type/red/tc-0001.md"),
    ]);
    const { frontmatter } = parseOkfDocument(readFixture("graph/target-type/red/st-0001.md"));
    expect(checkLinkTargetType("ST-0001", frontmatter, type, graph, registry)).toEqual([
      expect.objectContaining({
        rule: "link/target-type",
        severity: "error",
        artifact: "ST-0001",
        subject: "implements",
      }),
    ]);
  });

  it("skips undeclared relationships and dangling/unknown-type targets", () => {
    const registry = buildRegistry();
    const type = registry.resolve("Story");
    const graph = new ArtifactGraph([{ id: "XX-0001", type: "Widget", frontmatter: {} }]);
    const frontmatter = {
      not_a_relationship: ["ST-0001"],
      implements: ["ST-9999"], // dangling
    };
    expect(checkLinkTargetType("ST-0001", frontmatter, type, graph, registry)).toEqual([]);
  });
});

describe("link/cardinality", () => {
  it("green: implements has >= min 1 entries", () => {
    const registry = buildRegistry();
    const type = registry.resolve("Story");
    const { frontmatter } = parseOkfDocument(readFixture("graph/cardinality/green/st-0001.md"));
    expect(checkLinkCardinality("ST-0001", frontmatter, type)).toEqual([]);
  });

  it("red: implements is empty, violating min 1", () => {
    const registry = buildRegistry();
    const type = registry.resolve("Story");
    const { frontmatter } = parseOkfDocument(readFixture("graph/cardinality/red/st-0001.md"));
    expect(checkLinkCardinality("ST-0001", frontmatter, type)).toEqual([
      expect.objectContaining({
        rule: "link/cardinality",
        severity: "error",
        artifact: "ST-0001",
        subject: "implements",
      }),
    ]);
  });

  it("an absent links key counts as zero entries, same as an empty array", () => {
    const registry = buildRegistry();
    const type = registry.resolve("Story");
    expect(checkLinkCardinality("ST-0001", {}, type)).toEqual(
      expect.arrayContaining([expect.objectContaining({ subject: "implements" })]),
    );
  });

  it("flags a max violation too", () => {
    const registry = ProfileRegistry.fromRawDocuments([
      readFixture("graph/profile/work-item.md"),
      `---
type: TypeDefinition
defines: Widget
extends: WorkItem
abstract: false
prefix: ST
fields: {}
links:
  depends_on: { target: [WorkItem], max: 1 }
body: { sections: [] }
---
`,
    ]);
    const type = registry.resolve("Widget");
    const findings = checkLinkCardinality(
      "ST-0001",
      { links: { depends_on: ["ST-0002", "ST-0003"] } },
      type,
    );
    expect(findings).toEqual([
      expect.objectContaining({ rule: "link/cardinality", subject: "depends_on" }),
    ]);
  });
});

describe("link/cycles", () => {
  it("green: depends_on is acyclic", () => {
    const registry = buildRegistry();
    const graph = new ArtifactGraph([
      loadArtifact("graph/cycles/green/st-0001.md"),
      loadArtifact("graph/cycles/green/st-0002.md"),
    ]);
    expect(checkLinkCycles(graph, registry)).toEqual([]);
  });

  it("red: ST-0001 depends_on ST-0002 depends_on ST-0001", () => {
    const registry = buildRegistry();
    const graph = new ArtifactGraph([
      loadArtifact("graph/cycles/red/st-0001.md"),
      loadArtifact("graph/cycles/red/st-0002.md"),
    ]);
    expect(checkLinkCycles(graph, registry)).toEqual([
      expect.objectContaining({
        rule: "link/cycles",
        severity: "error",
        artifact: "ST-0001",
        subject: "depends_on",
      }),
    ]);
  });
});
