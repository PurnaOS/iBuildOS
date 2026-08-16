import { describe, expect, it } from "vitest";
import { parseOkfDocument } from "../store/okf-document.js";
import { ProfileRegistry } from "../profile/registry.js";
import { validateArtifact } from "./engine.js";
import { readFixture } from "../test-utils/fixtures.js";

function buildRegistry(): ProfileRegistry {
  return ProfileRegistry.fromRawDocuments([
    readFixture("profile/work-item.md"),
    readFixture("profile/story.md"),
    readFixture("profile/requirement.md"),
    readFixture("profile/test-case.md"),
    readFixture("profile/design-direction.md"),
    readFixture("profile/task.md"),
    readFixture("profile/epic.md"),
  ]);
}

describe("rule engine — store -> profile -> rules pipeline", () => {
  it("green path: the worked Story example has no id/field findings", () => {
    const registry = buildRegistry();
    const resolvedStory = registry.resolve("Story");
    const { frontmatter } = parseOkfDocument(readFixture("okf/st-0042.md"));

    const findings = validateArtifact(frontmatter, resolvedStory);

    expect(findings).toEqual([]);
  });

  it("red path: missing-required-field.md flags doc/field-required", () => {
    const registry = buildRegistry();
    const resolvedStory = registry.resolve("Story");
    const { frontmatter } = parseOkfDocument(readFixture("invalid/missing-required-field.md"));

    const findings = validateArtifact(frontmatter, resolvedStory);

    expect(findings).toEqual([
      expect.objectContaining({
        rule: "doc/field-required",
        subject: "owner",
        artifact: "ST-0099",
      }),
    ]);
  });

  it("red path: wrong-field-kind.md flags doc/field-kind", () => {
    const registry = buildRegistry();
    const resolvedStory = registry.resolve("Story");
    const { frontmatter } = parseOkfDocument(readFixture("invalid/wrong-field-kind.md"));

    const findings = validateArtifact(frontmatter, resolvedStory);

    expect(findings).toEqual([
      expect.objectContaining({
        rule: "doc/field-kind",
        subject: "estimate",
        artifact: "ST-0098",
      }),
    ]);
  });

  it("red path: bad-id-format.md flags id/format", () => {
    const registry = buildRegistry();
    const resolvedStory = registry.resolve("Story");
    const { frontmatter } = parseOkfDocument(readFixture("invalid/bad-id-format.md"));

    const findings = validateArtifact(frontmatter, resolvedStory);

    expect(findings).toEqual([
      expect.objectContaining({ rule: "id/format", artifact: "STORY-42" }),
    ]);
  });
});
