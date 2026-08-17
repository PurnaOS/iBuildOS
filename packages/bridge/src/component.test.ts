import { describe, expect, it } from "vitest";
import type { ComponentAnswer } from "@ibuildos/schemas";
import { encodeComponentAnswer, extractAnswerBlock } from "./component.js";

describe("component answer encoding (FORMATS.md §10)", () => {
  const answer: ComponentAnswer = { v: 1, cid: "q1", response: { choice: "newest" } };

  it("encodes a fenced ibuildos:answer block plus a prose restatement", () => {
    const content = encodeComponentAnswer(answer);
    expect(content).toContain("```ibuildos:answer");
    expect(content).toContain(JSON.stringify(answer));
    expect(content).toMatch(/Answered component "q1"/);
  });

  it("round-trips through extractAnswerBlock back to the original typed answer", () => {
    const content = encodeComponentAnswer(answer);
    expect(extractAnswerBlock(content)).toEqual(answer);
  });

  it("extracts the fenced block even with surrounding prose from a real agent turn", () => {
    const content = `Sure, going with newest.\n\n${encodeComponentAnswer(answer)}\n\nLet me know if that's wrong.`;
    expect(extractAnswerBlock(content)).toEqual(answer);
  });

  it("returns null when there's no fenced answer block", () => {
    expect(extractAnswerBlock("just some prose")).toBeNull();
  });

  it("returns null when the fenced block doesn't validate against ComponentAnswerSchema", () => {
    const content = "```ibuildos:answer\n{\"not\":\"an answer\"}\n```";
    expect(extractAnswerBlock(content)).toBeNull();
  });
});
