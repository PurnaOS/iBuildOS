import { describe, expect, it } from "vitest";
import { ComponentAnswerSchema, ComponentEnvelopeSchema } from "./component.js";

describe("generative-UI component envelope (FORMATS.md §10)", () => {
  it("parses the worked decision-card example", () => {
    const envelope = {
      v: 1,
      kind: "decision-card",
      cid: "q1",
      title: "Sync conflict policy?",
      body: "Two devices can edit the same inspection offline.",
      options: [
        { id: "newest", label: "Newest edit wins", consequence: "…" },
        { id: "ask", label: "Ask the user", consequence: "…" },
      ],
      recommend: "newest",
    };
    expect(ComponentEnvelopeSchema.parse(envelope)).toMatchObject(envelope);
  });

  it("rejects an unknown catalog kind", () => {
    expect(() =>
      ComponentEnvelopeSchema.parse({ v: 1, kind: "mystery-widget", cid: "q1" }),
    ).toThrow();
  });

  it("parses the worked answer example", () => {
    const answer = { v: 1, cid: "q1", response: { choice: "newest" } };
    expect(ComponentAnswerSchema.parse(answer)).toEqual(answer);
  });
});
