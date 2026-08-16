import { describe, expect, it } from "vitest";
import { ProfileMetaValidationError, ProfileRegistry } from "./registry.js";
import { readFixture } from "../test-utils/fixtures.js";

const workItem = () => readFixture("profile/work-item.md");
const story = () => readFixture("profile/story.md");

// Story's `links` reference these — a real profile needs every target type
// loaded for meta-validation to pass (FORMATS §5/§6 `profile/meta-valid`).
const storyLinkTargets = () => [
  readFixture("profile/requirement.md"),
  readFixture("profile/test-case.md"),
  readFixture("profile/design-direction.md"),
  readFixture("profile/task.md"),
  readFixture("profile/epic.md"),
];

describe("ProfileRegistry — extends resolution", () => {
  it("resolves Story's extends chain to WorkItem", () => {
    const registry = ProfileRegistry.fromRawDocuments([
      workItem(),
      story(),
      ...storyLinkTargets(),
    ]);
    const resolved = registry.resolve("Story");
    expect(resolved.chain).toEqual(["WorkItem", "Story"]);
    expect(resolved.abstract).toBe(false);
    expect(resolved.prefix).toBe("ST");
    expect(resolved.fields.estimate?.kind).toBe("number");
    expect(resolved.links.implements?.target).toEqual(["Requirement"]);
  });

  it("is-or-extends: satisfies() sees Story as a WorkItem and as itself", () => {
    const registry = ProfileRegistry.fromRawDocuments([
      workItem(),
      story(),
      ...storyLinkTargets(),
    ]);
    expect(registry.satisfies("Story", "WorkItem")).toBe(true);
    expect(registry.satisfies("Story", "Story")).toBe(true);
    expect(registry.satisfies("WorkItem", "Story")).toBe(false);
  });

  it("fails meta-validation on an unknown extends target", () => {
    const orphan = `---
type: TypeDefinition
defines: Orphan
extends: Nonexistent
abstract: false
fields: {}
links: {}
body: { sections: [] }
---
`;
    expect(() => ProfileRegistry.fromRawDocuments([orphan])).toThrow(
      ProfileMetaValidationError,
    );
    expect(() => ProfileRegistry.fromRawDocuments([orphan])).toThrow(/extends unknown type/);
  });

  it("fails meta-validation on an unknown link target type", () => {
    const badLink = `---
type: TypeDefinition
defines: Widget
abstract: false
fields: {}
links:
  gizmos: { target: [Gizmo] }
body: { sections: [] }
---
`;
    expect(() => ProfileRegistry.fromRawDocuments([badLink])).toThrow(
      /targets unknown type "Gizmo"/,
    );
  });

  it("fails on a duplicate type definition", () => {
    expect(() => ProfileRegistry.fromRawDocuments([workItem(), workItem()])).toThrow(
      /duplicate TypeDefinition/,
    );
  });
});
