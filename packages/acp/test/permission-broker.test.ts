import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { PermissionBroker } from "../src/permission-broker.js";

const request: RequestPermissionRequest = {
  sessionId: "s1",
  toolCall: { toolCallId: "tc-1" },
  options: [
    { optionId: "allow", name: "Allow", kind: "allow_once" },
    { optionId: "reject", name: "Reject", kind: "reject_once" },
  ],
};

describe("PermissionBroker (AC-006)", () => {
  it("allow decision selects the allow_once option", async () => {
    const broker = new PermissionBroker(() => "allow");
    const { response, decision } = await broker.resolve(request);
    expect(decision).toBe("allow");
    expect(response.outcome).toEqual({ outcome: "selected", optionId: "allow" });
  });

  it("deny decision selects the reject_once option", async () => {
    const broker = new PermissionBroker(() => "deny");
    const { response } = await broker.resolve(request);
    expect(response.outcome).toEqual({ outcome: "selected", optionId: "reject" });
  });

  it("ask decision cancels when no escalation handler is injected", async () => {
    const broker = new PermissionBroker(() => "ask");
    const { response, decision } = await broker.resolve(request);
    expect(decision).toBe("ask");
    expect(response.outcome).toEqual({ outcome: "cancelled" });
  });

  it("ask decision resolves via the injected escalation handler", async () => {
    const broker = new PermissionBroker(
      () => "ask",
      async (req) => req.options[1]!.optionId, // picks "reject"
    );
    const { response } = await broker.resolve(request);
    expect(response.outcome).toEqual({ outcome: "selected", optionId: "reject" });
  });

  it("ask decision cancels when the escalation handler declines (returns null)", async () => {
    const broker = new PermissionBroker(() => "ask", async () => null);
    const { response } = await broker.resolve(request);
    expect(response.outcome).toEqual({ outcome: "cancelled" });
  });

  it("cancels an allow decision when no allow option is offered", async () => {
    const denyOnlyRequest: RequestPermissionRequest = {
      sessionId: "s1",
      toolCall: { toolCallId: "tc-1" },
      options: [{ optionId: "reject", name: "Reject", kind: "reject_once" }],
    };
    const broker = new PermissionBroker(() => "allow");
    const { response } = await broker.resolve(denyOnlyRequest);
    expect(response.outcome).toEqual({ outcome: "cancelled" });
  });
});
