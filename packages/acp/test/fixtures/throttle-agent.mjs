#!/usr/bin/env node
// Fixture agent for BD-016. Fails the first N `session/prompt` calls with a
// rate-limit-shaped error, then succeeds — a real over-stdio 429 rather
// than a faked one (see the package README on why packages/stub-agent has
// no error-injection mechanism to drive this against instead: its
// `ScenarioUpdateSchema` has no error kind, and `agent.ts` only ever throws
// for an unhandled method).
//
// argv[2]: how many session/prompt calls to fail before succeeding
// (default 2, matching BD-016/DEFAULTS #9's "halves after 2nd consecutive
// throttle" needing at least two throttled attempts to observe).
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const failCount = Number(process.argv[2] ?? "2");
let attempts = 0;
let sessionCounter = 0;

acp
  .agent({ name: "fixture-throttle-agent" })
  .onRequest(acp.methods.agent.initialize, () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: { promptCapabilities: {} },
  }))
  .onRequest(acp.methods.agent.session.new, () => ({
    sessionId: `throttle-session-${++sessionCounter}`,
  }))
  .onRequest(acp.methods.agent.session.prompt, async (ctx) => {
    attempts += 1;
    if (attempts <= failCount) {
      // A plain `throw new Error(...)` gets swallowed by the SDK's own
      // dispatch and surfaced to the client as a generic "Internal error"
      // (verified empirically) — the SDK's exported `RequestError` is what
      // actually puts a caller-chosen message on the wire.
      throw new acp.RequestError(-32000, `rate limit exceeded (429): too many requests, attempt ${attempts}`);
    }
    await ctx.client.notify(acp.methods.client.session.update, {
      sessionId: ctx.params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `ok after ${attempts} attempts` },
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
