#!/usr/bin/env node
// A minimal ACP agent, authored directly against the real SDK's `agent()`
// builder, run as a real child process over real stdio.
//
// Why this file exists instead of driving packages/stub-agent's
// `permission-request.json` scenario: that scenario file (and the
// agent.ts support for `session/load`/agent-initiated
// `session/request_permission` it needs) is not present in this worktree's
// git history — `git log --all` finds no commit anywhere in this repo that
// added it; it only exists as uncommitted state in a *different*,
// shared checkout this worktree-isolated session cannot write to or build
// against reproducibly. See the package README for the full finding.
// Building this fixture against the real SDK instead means its
// `session/request_permission` payload is schema-valid *by construction*
// (same SDK, same zod schemas on both ends) — the permission broker under
// test actually exercises the real wire shape, not an approximation of it.
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

let sessionCounter = 0;

acp
  .agent({ name: "fixture-perm-agent" })
  .onRequest(acp.methods.agent.initialize, () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: { promptCapabilities: {} },
  }))
  .onRequest(acp.methods.agent.session.new, (ctx) => ({
    sessionId: `perm-session-${++sessionCounter}`,
    // Echoes the received MCP server list back via `_meta` (a documented
    // free-form passthrough bag on NewSessionResponse) so AC-009 tests can
    // assert on the passthrough without needing to tap outbound frames.
    _meta: { mcpServersSeen: ctx.params.mcpServers },
  }))
  .onRequest(acp.methods.agent.session.prompt, async (ctx) => {
    const sessionId = ctx.params.sessionId;

    await ctx.client.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "I'll need to run the test suite." },
      },
    });

    const outcome = await ctx.client.request(acp.methods.client.session.requestPermission, {
      sessionId,
      toolCall: { toolCallId: "tc-1", title: "Run tests", kind: "execute" },
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once" },
        { optionId: "reject", name: "Reject", kind: "reject_once" },
      ],
    });

    await ctx.client.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `Permission outcome: ${JSON.stringify(outcome)}` },
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
