import { describe, expect, it } from "vitest";
import { parseOkfDocument } from "../store/okf-document.js";
import { ProfileRegistry } from "../profile/registry.js";
import { readFixture } from "../test-utils/fixtures.js";
import {
  checkBodyLink,
  checkCriteriaItems,
  checkIdDuplicate,
  checkIdProvisionalOnTrunk,
  checkSectionRequired,
  resolveProfileSafely,
} from "./doc-structure.js";

function buildRegistry(): ProfileRegistry {
  return ProfileRegistry.fromRawDocuments([
    readFixture("graph/profile/work-item.md"),
    readFixture("graph/profile/requirement.md"),
    readFixture("graph/profile/story.md"),
    readFixture("graph/profile/task.md"),
    readFixture("graph/profile/test-case.md"),
  ]);
}

describe("doc/section-required", () => {
  it("green: the required 'Acceptance criteria' section is present", () => {
    const type = buildRegistry().resolve("Requirement");
    const { body } = parseOkfDocument(readFixture("graph/section-required/green/rq-0001.md"));
    expect(checkSectionRequired("RQ-0001", body, type)).toEqual([]);
  });

  it("red: the required section is missing entirely", () => {
    const type = buildRegistry().resolve("Requirement");
    const { body } = parseOkfDocument(readFixture("graph/section-required/red/rq-0001.md"));
    expect(checkSectionRequired("RQ-0001", body, type)).toEqual([
      expect.objectContaining({
        rule: "doc/section-required",
        severity: "error",
        artifact: "RQ-0001",
        subject: "Acceptance criteria",
      }),
    ]);
  });
});

describe("doc/criteria-items", () => {
  const type = buildRegistry().resolve("Requirement");

  it("passes when every item carries a unique [AC-n] id", () => {
    const body = `## Acceptance criteria
- [AC-1] First.
- [AC-2] Second.
`;
    expect(checkCriteriaItems("RQ-0001", body, type)).toEqual([]);
  });

  it("flags a list item with no [AC-n] id", () => {
    const body = `## Acceptance criteria
- [AC-1] First.
- Second, missing its id.
`;
    expect(checkCriteriaItems("RQ-0001", body, type)).toEqual([
      expect.objectContaining({ rule: "doc/criteria-items", subject: "Acceptance criteria" }),
    ]);
  });

  it("flags a duplicate [AC-n] id", () => {
    const body = `## Acceptance criteria
- [AC-1] First.
- [AC-1] Duplicate of the first.
`;
    expect(checkCriteriaItems("RQ-0001", body, type)).toEqual([
      expect.objectContaining({
        rule: "doc/criteria-items",
        subject: "AC-1",
        severity: "error",
      }),
    ]);
  });

  it("skips a section whose heading is missing (doc/section-required's concern)", () => {
    expect(checkCriteriaItems("RQ-0001", "no heading here at all", type)).toEqual([]);
  });
});

describe("doc/body-link", () => {
  it("flags a link whose href doesn't resolve", () => {
    const body = "See [TC-0031](../tests/tc-0031.md) for details.";
    const linkExists = () => false;
    expect(checkBodyLink("ST-0001", body, linkExists)).toEqual([
      expect.objectContaining({
        rule: "doc/body-link",
        severity: "warn",
        artifact: "ST-0001",
        subject: "../tests/tc-0031.md",
      }),
    ]);
  });

  it("passes when the injected resolver says the link exists", () => {
    const body = "See [TC-0031](../tests/tc-0031.md) for details.";
    expect(checkBodyLink("ST-0001", body, () => true)).toEqual([]);
  });

  it("never checks external links or same-document anchors", () => {
    const body = "[external](https://example.com/x) and [anchor](#section)";
    expect(checkBodyLink("ST-0001", body, () => false)).toEqual([]);
  });
});

describe("id/duplicate", () => {
  it("passes on a bundle with no repeated final IDs", () => {
    expect(checkIdDuplicate([{ id: "ST-0001" }, { id: "ST-0002" }])).toEqual([]);
  });

  it("flags a final ID that appears more than once, once per ID", () => {
    expect(checkIdDuplicate([{ id: "ST-0001" }, { id: "st-0001" }, { id: "ST-0002" }])).toEqual([
      expect.objectContaining({
        rule: "id/duplicate",
        severity: "error",
        artifact: "ST-0001",
        subject: "id",
      }),
    ]);
  });

  it("ignores provisional IDs (a different rule's concern)", () => {
    expect(checkIdDuplicate([{ id: "TC-pa3f9-1" }, { id: "TC-pa3f9-1" }])).toEqual([]);
  });
});

describe("id/provisional-on-trunk", () => {
  it("passes when every ID in the bundle is final", () => {
    expect(checkIdProvisionalOnTrunk([{ id: "ST-0001" }])).toEqual([]);
  });

  it("flags any provisional ID present", () => {
    expect(checkIdProvisionalOnTrunk([{ id: "TC-pa3f9-2" }])).toEqual([
      expect.objectContaining({
        rule: "id/provisional-on-trunk",
        severity: "error",
        artifact: "TC-pa3f9-2",
        subject: "id",
      }),
    ]);
  });
});

describe("resolveProfileSafely — non-throwing profile/meta-valid", () => {
  it("green: a valid profile resolves with no findings", () => {
    const { registry, findings } = resolveProfileSafely([
      readFixture("graph/profile/work-item.md"),
      readFixture("graph/profile/requirement.md"),
      readFixture("graph/profile/story.md"),
      readFixture("graph/profile/task.md"),
      readFixture("graph/profile/test-case.md"),
    ]);
    expect(findings).toEqual([]);
    expect(registry.resolve("Story").prefix).toBe("ST");
  });

  it("red: an unknown extends target becomes a Finding instead of throwing", () => {
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
    const { findings } = resolveProfileSafely([orphan]);
    expect(findings).toEqual([
      expect.objectContaining({
        rule: "profile/meta-valid",
        severity: "error",
        artifact: "Orphan",
        subject: "extends",
      }),
    ]);
  });

  it("red: an unknown link target becomes a Finding instead of throwing", () => {
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
    const { findings } = resolveProfileSafely([badLink]);
    expect(findings).toEqual([
      expect.objectContaining({
        rule: "profile/meta-valid",
        artifact: "Widget",
        subject: "links",
      }),
    ]);
  });

  it("red: a duplicate TypeDefinition becomes a Finding instead of throwing", () => {
    const dup = readFixture("graph/profile/work-item.md");
    const { findings } = resolveProfileSafely([dup, dup]);
    expect(findings).toEqual([
      expect.objectContaining({ rule: "profile/meta-valid", artifact: "WorkItem", subject: "defines" }),
    ]);
  });

  it("respects a gate context override (e.g. profile/meta-valid stays 'error' regardless — no override declared)", () => {
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
    const { findings } = resolveProfileSafely([orphan], "merge");
    expect(findings[0]?.severity).toBe("error");
  });
});
