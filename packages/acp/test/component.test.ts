import { describe, expect, it } from "vitest";
import {
  encodeAnswerFence,
  encodeComponentFence,
  encodeSecretGrantAnswer,
  encodeSecretRequestFence,
  parseFences,
} from "../src/component.js";
import type { ComponentEnvelope } from "@ibuildos/schemas";

describe("component fences (FORMATS §10, GU-012 carrier B)", () => {
  it("round-trips a component envelope", () => {
    const envelope: ComponentEnvelope = {
      v: 1,
      kind: "decision-card",
      cid: "q1",
      title: "Sync conflict policy?",
      options: [{ id: "newest", label: "Newest edit wins" }],
      recommend: "newest",
    };
    const text = `Here's a decision:\n${encodeComponentFence(envelope)}\nplease answer.`;
    const found = parseFences(text);
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({ kind: "component", envelope });
  });

  it("round-trips an answer fence", () => {
    const answer = { v: 1 as const, cid: "q1", response: { choice: "newest" } };
    const text = encodeAnswerFence(answer);
    const found = parseFences(text);
    expect(found).toEqual([{ kind: "answer", answer }]);
  });

  it("round-trips a secret-request fence", () => {
    const request = { v: 1 as const, cid: "secret-1", name: "STRIPE_TEST_KEY", reason: "billing sandbox" };
    const text = encodeSecretRequestFence(request);
    const found = parseFences(text);
    expect(found).toEqual([{ kind: "secret-request", request }]);
  });

  it("builds the AC-013 secret-grant answer per FORMATS §10's documented shape", () => {
    const text = encodeSecretGrantAnswer("secret-1", { granted: true, env: "STRIPE_TEST_KEY" });
    const found = parseFences(text);
    expect(found).toEqual([
      { kind: "answer", answer: { v: 1, cid: "secret-1", response: { granted: true, env: "STRIPE_TEST_KEY" } } },
    ]);
  });

  it("never puts a secret value in the answer fence text", () => {
    const text = encodeSecretGrantAnswer("secret-1", { granted: true, env: "STRIPE_TEST_KEY" });
    expect(text).not.toContain("sk_test_super_secret_value");
  });

  it("skips unrecognized info strings and malformed JSON (GU-009 forward-compat)", () => {
    const text = [
      "```some-other-lang\n{}\n```",
      "```ibuildos:component\nnot json\n```",
      "prose in between",
    ].join("\n");
    expect(parseFences(text)).toEqual([]);
  });
});
