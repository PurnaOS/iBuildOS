#!/usr/bin/env node
// Fixture agent for AC-013 (see perm-agent.mjs's doc comment for why this
// package supplies its own fixture rather than a packages/stub-agent
// scenario). Turn 1 emits a message chunk carrying the
// `ibuildos:secret-request` fence (component.ts's carrier-B extension, see
// the package README) and stops. Turn 2 — recognized by the client's next
// prompt containing an `ibuildos:answer` fence — confirms receipt without
// ever echoing the granted value back onto the wire.
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

let sessionCounter = 0;

function promptText(prompt) {
  return (prompt ?? [])
    .map((block) => (block && block.type === "text" ? block.text : ""))
    .join("");
}

acp
  .agent({ name: "fixture-secret-agent" })
  .onRequest(acp.methods.agent.initialize, () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: { promptCapabilities: {} },
  }))
  .onRequest(acp.methods.agent.session.new, () => ({
    sessionId: `secret-session-${++sessionCounter}`,
  }))
  .onRequest(acp.methods.agent.session.prompt, async (ctx) => {
    const sessionId = ctx.params.sessionId;
    const text = promptText(ctx.params.prompt);

    if (text.includes("ibuildos:answer")) {
      await ctx.client.notify(acp.methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Secret received, continuing." },
        },
      });
      return { stopReason: "end_turn" };
    }

    const fence =
      "```ibuildos:secret-request\n" +
      JSON.stringify({
        v: 1,
        cid: "secret-1",
        name: "STRIPE_TEST_KEY",
        reason: "need it to call the billing sandbox",
      }) +
      "\n```";

    await ctx.client.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `I need a credential.\n${fence}` },
      },
    });
    return { stopReason: "end_turn" };
  })
  .connect(
    acp.ndJsonStream(
      Writable.toWeb(process.stdout),
      Readable.toWeb(process.stdin),
    ),
  );
