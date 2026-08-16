import { describe, expect, it } from "vitest";
import { parseOkfDocument, serializeOkfDocument, setScalarField } from "./okf-document.js";
import { readFixture } from "../test-utils/fixtures.js";

describe("OKF store round-trip fidelity (S-5 concern)", () => {
  for (const fixture of ["okf/st-0042.md", "profile/story.md", "profile/work-item.md"]) {
    it(`reproduces ${fixture} byte-for-byte with no edits`, () => {
      const raw = readFixture(fixture);
      const doc = parseOkfDocument(raw);
      expect(serializeOkfDocument(doc)).toBe(raw);
    });
  }

  it("rejects CRLF line endings", () => {
    expect(() => parseOkfDocument("---\r\ntype: Story\r\n---\r\nbody\r\n")).toThrow(
      /CRLF/,
    );
  });

  it("rejects a document missing the frontmatter delimiter", () => {
    expect(() => parseOkfDocument("type: Story\n")).toThrow(/frontmatter delimiter/);
  });

  it("rejects unclosed frontmatter", () => {
    expect(() => parseOkfDocument("---\ntype: Story\n")).toThrow(/not closed/);
  });
});

describe("scalar value edits produce a minimal diff", () => {
  it("changes exactly the target field's line, nothing else", () => {
    const raw = readFixture("okf/st-0042.md");
    const doc = parseOkfDocument(raw);
    setScalarField(doc, "state", "accepted");
    const edited = serializeOkfDocument(doc);

    expect(doc.frontmatter.state).toBe("accepted");

    const beforeLines = raw.split("\n");
    const afterLines = edited.split("\n");
    expect(afterLines).toHaveLength(beforeLines.length);

    const changedLines = beforeLines.filter((line, i) => line !== afterLines[i]);
    expect(changedLines).toEqual(["state: building"]);
    expect(afterLines).toContain("state: accepted");
  });

  it("supports nested path edits", () => {
    const raw = readFixture("okf/st-0042.md");
    const doc = parseOkfDocument(raw);
    setScalarField(doc, ["generated", "by"], "codex/codex-acp@1.2.0");
    expect((doc.frontmatter.generated as { by: string }).by).toBe("codex/codex-acp@1.2.0");
    // round-trips again after the edit, from its own new baseline
    const reparsed = parseOkfDocument(serializeOkfDocument(doc));
    expect(serializeOkfDocument(reparsed)).toBe(serializeOkfDocument(doc));
  });
});
