import { describe, expect, it } from "vitest";
import { parseOkfDocument } from "../store/okf-document.js";
import { ProfileRegistry } from "../profile/registry.js";
import { ArtifactGraph } from "../graph/graph.js";
import { readFixture } from "../test-utils/fixtures.js";
import { checkStateApproved, checkStateDerived, checkStateLegal, checkStateVocabulary } from "./state.js";

function buildRegistry(): ProfileRegistry {
  return ProfileRegistry.fromRawDocuments([
    readFixture("graph/profile/work-item.md"),
    readFixture("graph/profile/requirement.md"),
    readFixture("graph/profile/story.md"),
    readFixture("graph/profile/task.md"),
    readFixture("graph/profile/test-case.md"),
  ]);
}

describe("state/vocabulary", () => {
  it("passes when state is in the type's vocabulary", () => {
    const type = buildRegistry().resolve("Story");
    expect(checkStateVocabulary("ST-0001", { state: "draft" }, type)).toEqual([]);
  });

  it("flags a state outside the vocabulary", () => {
    const type = buildRegistry().resolve("Story");
    expect(checkStateVocabulary("ST-0001", { state: "bogus" }, type)).toEqual([
      expect.objectContaining({
        rule: "state/vocabulary",
        severity: "error",
        artifact: "ST-0001",
        subject: "state",
      }),
    ]);
  });
});

describe("state/legal", () => {
  it("green: draft -> ready is a declared WorkItem transition", () => {
    const type = buildRegistry().resolve("Story");
    const { frontmatter } = parseOkfDocument(readFixture("graph/state-legal/green/st-0001.md"));
    expect(checkStateLegal("ST-0001", frontmatter, type, "draft")).toEqual([]);
  });

  it("red: draft -> done is not a declared transition", () => {
    const type = buildRegistry().resolve("Story");
    const { frontmatter } = parseOkfDocument(readFixture("graph/state-legal/red/st-0001.md"));
    expect(checkStateLegal("ST-0001", frontmatter, type, "draft")).toEqual([
      expect.objectContaining({
        rule: "state/legal",
        severity: "error",
        artifact: "ST-0001",
        subject: "state",
      }),
    ]);
  });

  it("no-ops when previousState is null (nothing to diff against)", () => {
    const type = buildRegistry().resolve("Story");
    expect(checkStateLegal("ST-0001", { state: "done" }, type, null)).toEqual([]);
  });

  it("the '*' wildcard from-state legalizes any -> retired transition", () => {
    const type = buildRegistry().resolve("Story");
    expect(checkStateLegal("ST-0001", { state: "retired" }, type, "building")).toEqual([]);
  });

  it("a from: [list] transition matches any listed source state", () => {
    const type = buildRegistry().resolve("Story");
    expect(checkStateLegal("ST-0001", { state: "review" }, type, "done")).toEqual([]);
  });
});

describe("state/approved", () => {
  const reviewType = `---
type: TypeDefinition
defines: Review
abstract: false
prefix: RV
fields: {}
links: {}
body: { sections: [] }
---
`;

  function registryWithReview(): ProfileRegistry {
    return ProfileRegistry.fromRawDocuments([
      readFixture("graph/profile/work-item.md"),
      readFixture("graph/profile/story.md"),
      readFixture("graph/profile/requirement.md"),
      readFixture("graph/profile/test-case.md"),
      reviewType,
    ]);
  }

  it("passes when an accepted Review targets this artifact", () => {
    const type = registryWithReview().resolve("Story");
    const registry = registryWithReview();
    const graph = new ArtifactGraph([
      { id: "ST-0001", type: "Story", frontmatter: { state: "accepted" } },
      {
        id: "RV-0001",
        type: "Review",
        frontmatter: { subject: "ST-0001", verdict: "accepted" },
      },
    ]);
    expect(
      checkStateApproved("ST-0001", { state: "accepted" }, type, graph, registry, "review"),
    ).toEqual([]);
  });

  it("a waived verdict counts too (D-115 dial-waivable)", () => {
    const type = registryWithReview().resolve("Story");
    const registry = registryWithReview();
    const graph = new ArtifactGraph([
      { id: "ST-0001", type: "Story", frontmatter: { state: "accepted" } },
      { id: "RV-0001", type: "Review", frontmatter: { subject: "ST-0001", verdict: "waived" } },
    ]);
    expect(
      checkStateApproved("ST-0001", { state: "accepted" }, type, graph, registry, "review"),
    ).toEqual([]);
  });

  it("matches a lowercase Review.subject against the artifact ID (FORMATS §2 case-insensitivity)", () => {
    const type = registryWithReview().resolve("Story");
    const registry = registryWithReview();
    const graph = new ArtifactGraph([
      { id: "ST-0001", type: "Story", frontmatter: { state: "accepted" } },
      { id: "RV-0001", type: "Review", frontmatter: { subject: "st-0001", verdict: "accepted" } },
    ]);
    expect(
      checkStateApproved("ST-0001", { state: "accepted" }, type, graph, registry, "review"),
    ).toEqual([]);
  });

  it("flags an approval-requiring transition with no matching Review", () => {
    const type = registryWithReview().resolve("Story");
    const registry = registryWithReview();
    const graph = new ArtifactGraph([{ id: "ST-0001", type: "Story", frontmatter: {} }]);
    expect(
      checkStateApproved("ST-0001", { state: "accepted" }, type, graph, registry, "review"),
    ).toEqual([
      expect.objectContaining({
        rule: "state/approved",
        severity: "error",
        artifact: "ST-0001",
        subject: "state",
      }),
    ]);
  });

  it("no-ops for a transition that doesn't declare approval", () => {
    const type = registryWithReview().resolve("Story");
    const registry = registryWithReview();
    const graph = new ArtifactGraph([{ id: "ST-0001", type: "Story", frontmatter: {} }]);
    expect(
      checkStateApproved("ST-0001", { state: "ready" }, type, graph, registry, "draft"),
    ).toEqual([]);
  });
});

describe("state/derived", () => {
  const derivedType = `---
type: TypeDefinition
defines: Requirement
abstract: false
prefix: RQ
fields: {}
links: {}
states:
  vocabulary: [draft, ready, approved]
  initial: draft
  transitions:
    - { from: draft, to: ready }
    - { from: ready, to: approved }
  derived: true
body: { sections: [] }
---
`;

  it("flags a transition on a type whose states are engine-derived", () => {
    const registry = ProfileRegistry.fromRawDocuments([derivedType]);
    const type = registry.resolve("Requirement");
    expect(checkStateDerived("RQ-0001", { state: "ready" }, type, "draft")).toEqual([
      expect.objectContaining({
        rule: "state/derived",
        severity: "warn",
        artifact: "RQ-0001",
        subject: "state",
      }),
    ]);
  });

  it("no-ops when the type doesn't mark states as derived", () => {
    const type = buildRegistry().resolve("Story");
    expect(checkStateDerived("ST-0001", { state: "ready" }, type, "draft")).toEqual([]);
  });

  it("no-ops when previousState is null or unchanged", () => {
    const registry = ProfileRegistry.fromRawDocuments([derivedType]);
    const type = registry.resolve("Requirement");
    expect(checkStateDerived("RQ-0001", { state: "ready" }, type, null)).toEqual([]);
    expect(checkStateDerived("RQ-0001", { state: "ready" }, type, "ready")).toEqual([]);
  });
});
