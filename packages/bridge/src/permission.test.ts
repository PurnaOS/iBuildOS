import { describe, expect, it } from "vitest";
import { encodePermissionAnswer, encodePermissionCancellation, mapPermissionRequestToInterrupt } from "./permission.js";

describe("permission mapping (session/request_permission -> HITL_INTERRUPT)", () => {
  it("maps a request id + params to a HitlInterruptEvent, carrying the id through as interruptId", () => {
    const event = mapPermissionRequestToInterrupt("agent-1", {
      toolCall: { toolCallId: "tc-1", title: "Run tests", kind: "execute" },
      options: [
        { id: "allow", label: "Allow" },
        { id: "reject", label: "Reject" },
      ],
    });
    expect(event).toEqual({
      type: "HITL_INTERRUPT",
      interruptId: "agent-1",
      toolCall: { toolCallId: "tc-1", title: "Run tests", kind: "execute" },
      options: [
        { id: "allow", label: "Allow" },
        { id: "reject", label: "Reject" },
      ],
    });
  });

  it("stringifies a numeric request id", () => {
    const event = mapPermissionRequestToInterrupt(42, { toolCall: {}, options: [{ id: "a", label: "A" }] });
    expect(event.interruptId).toBe("42");
  });
});

describe("permission answer encoding — matches what stub-agent's sendRequest() expects as a result", () => {
  it("encodes a selected option", () => {
    expect(encodePermissionAnswer("allow")).toEqual({ outcome: "selected", optionId: "allow" });
  });

  it("encodes a cancellation", () => {
    expect(encodePermissionCancellation()).toEqual({ outcome: "cancelled" });
  });
});
