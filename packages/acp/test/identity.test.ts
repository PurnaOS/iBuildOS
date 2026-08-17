import { describe, expect, it } from "vitest";
import { formatAgentIdentity, parseAgentIdentity, transcriptUri } from "../src/identity.js";

describe("agent identity string (FORMATS §10)", () => {
  it("formats <agent>/<adapter>@<version>", () => {
    expect(formatAgentIdentity({ agent: "claude-code", adapter: "claude-agent-acp", version: "0.66.0" })).toBe(
      "claude-code/claude-agent-acp@0.66.0",
    );
  });

  it("round-trips the examples given in FORMATS §10", () => {
    for (const s of [
      "claude-code/claude-agent-acp@0.66.0",
      "codex/codex-acp@1.2.0",
      "pi/pi-acp@0.0.33",
    ]) {
      expect(formatAgentIdentity(parseAgentIdentity(s))).toBe(s);
    }
  });

  it("rejects a malformed identity string", () => {
    expect(() => parseAgentIdentity("not-an-identity-string")).toThrow();
  });
});

describe("transcriptUri (FORMATS §9)", () => {
  it("builds the ibos-transcript:// URI", () => {
    expect(transcriptUri("01ARZ3NDEKTSV4RRFFQ69G5FAV", "RN-0001")).toBe(
      "ibos-transcript://01ARZ3NDEKTSV4RRFFQ69G5FAV/RN-0001.jsonl",
    );
  });
});
