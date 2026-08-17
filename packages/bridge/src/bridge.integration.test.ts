import { afterEach, describe, expect, it } from "vitest";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { AcpBridgeClient } from "./client.js";
import type { AGUIEvent } from "./ag-ui-events.js";
import { encodeComponentAnswer, extractAnswerBlock } from "./component.js";
import { spawnOwnScenario, spawnStubAgentScenario } from "./spawn.js";

// Real child-process integration tests: the bridge spawns @ibuildos/stub-agent
// (its own scenario driver for fixtures in this package, or the shipped CLI
// for stub-agent's built-in scenarios) exactly as WP11 does — independently,
// with no shared code between the two spawn paths beyond the public
// @ibuildos/stub-agent package.

let activeProc: ChildProcessWithoutNullStreams | null = null;

afterEach(() => {
  if (activeProc && !activeProc.killed) activeProc.kill();
  activeProc = null;
});

// Collects events as they arrive and lets a test await "N events matching
// predicate have arrived" — mirrors stub-agent's own agent.test.ts
// watchLines() helper, one layer up (AGUIEvents instead of raw JSON-RPC
// lines), since we're asserting genuine async interleaving (the client
// stays blocked on a pending permission request), not just eventual
// completion.
function collectEvents(): {
  events: AGUIEvent[];
  onEvent: (event: AGUIEvent) => void;
  waitFor: (predicate: (e: AGUIEvent) => boolean, count: number) => Promise<AGUIEvent[]>;
} {
  const events: AGUIEvent[] = [];
  const waiters: Array<{ predicate: (e: AGUIEvent) => boolean; count: number; resolve: () => void }> = [];
  const onEvent = (event: AGUIEvent): void => {
    events.push(event);
    for (let i = waiters.length - 1; i >= 0; i--) {
      const waiter = waiters[i]!;
      if (events.filter(waiter.predicate).length >= waiter.count) {
        waiter.resolve();
        waiters.splice(i, 1);
      }
    }
  };
  return {
    events,
    onEvent,
    waitFor(predicate, count) {
      if (events.filter(predicate).length >= count) return Promise.resolve(events);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`timed out waiting for ${count} matching AG-UI events`)),
          5000,
        );
        waiters.push({
          predicate,
          count,
          resolve: () => {
            clearTimeout(timeout);
            resolve(events);
          },
        });
      });
    },
  };
}

describe("bridge integration — tool-call scenario", () => {
  it("maps a real spawned turn (message chunks + a tool call) to the correct ordered AG-UI sequence", async () => {
    const proc = spawnOwnScenario("tool-call.scenario.json");
    activeProc = proc;
    const events: AGUIEvent[] = [];
    const client = new AcpBridgeClient({
      input: proc.stdout,
      output: proc.stdin,
      onEvent: (e) => events.push(e),
    });

    await client.initialize();
    await client.newSession();
    const { result } = await client.prompt();

    expect(result).toMatchObject({ stopReason: "end_turn" });
    expect(events.map((e) => e.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "TOOL_CALL_START",
      "TOOL_CALL_RESULT",
      "TOOL_CALL_END",
      "RUN_FINISHED",
    ]);
    expect(events[2]).toMatchObject({ delta: "Hello" });
    expect(events[3]).toMatchObject({ delta: ", world." });
    expect(events[5]).toMatchObject({ toolCallId: "tc-1", toolCallName: "List files" });
  });
});

describe("bridge integration — decision-card component round trip", () => {
  it("emits a GENERATIVE_UI_COMPONENT event and sends a correctly-encoded answer back as a session/prompt turn the stub accepts", async () => {
    const proc = spawnOwnScenario("component-decision-card.scenario.json");
    activeProc = proc;
    const events: AGUIEvent[] = [];
    const client = new AcpBridgeClient({
      input: proc.stdout,
      output: proc.stdin,
      onEvent: (e) => events.push(e),
    });

    await client.initialize();
    await client.newSession();
    await client.prompt();

    const componentEvent = events.find((e) => e.type === "GENERATIVE_UI_COMPONENT");
    expect(componentEvent).toBeDefined();
    const component = (componentEvent as { component: { cid: string; kind: string } }).component;
    expect(component).toMatchObject({ kind: "decision-card", cid: "q1" });

    const answerText = encodeComponentAnswer({
      v: 1,
      cid: component.cid,
      response: { choice: "newest" },
    });

    const { sent, result } = await client.prompt(answerText);

    // The outbound frame the bridge actually wrote — the stub's
    // session/prompt handler ignores params and replays regardless, so this
    // (plus the stub responding at all) is what the round trip can prove.
    const sentText = (sent.prompt as Array<{ text: string }>)[0]?.text;
    expect(sentText).toBe(answerText);
    const roundTripped = extractAnswerBlock(sentText ?? "");
    expect(roundTripped).toEqual({ v: 1, cid: "q1", response: { choice: "newest" } });
    expect(result).toMatchObject({ stopReason: "end_turn" });
  });
});

describe("bridge integration — outbound permission request", () => {
  it("maps session/request_permission to a HITL_INTERRUPT, and the human's answer unblocks the stub's replay", async () => {
    const proc = spawnStubAgentScenario("permission-request");
    activeProc = proc;
    const collector = collectEvents();
    const client = new AcpBridgeClient({
      input: proc.stdout,
      output: proc.stdin,
      onEvent: collector.onEvent,
    });

    await client.initialize();
    await client.newSession();
    const promptPromise = client.prompt();

    await collector.waitFor((e) => e.type === "HITL_INTERRUPT", 1);
    const interrupt = collector.events.find((e) => e.type === "HITL_INTERRUPT") as
      | { interruptId: string; options: Array<{ id: string; label: string }> }
      | undefined;
    expect(interrupt).toBeDefined();
    expect(interrupt?.options).toEqual([
      { id: "allow", label: "Allow" },
      { id: "reject", label: "Reject" },
    ]);

    // The tool-call completion and trailing "Done." text only arrive after
    // the human answers — proves the client is genuinely blocked, not just
    // racing ahead (mirrors stub-agent's own permission-request test).
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(collector.events.filter((e) => e.type === "TOOL_CALL_START")).toHaveLength(0);

    client.answerPermission(interrupt!.interruptId, "allow");

    const { result } = await promptPromise;
    expect(result).toMatchObject({ stopReason: "end_turn" });

    const types = collector.events.map((e) => e.type);
    expect(types).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "HITL_INTERRUPT",
      "TOOL_CALL_START",
      "TOOL_CALL_RESULT",
      "TOOL_CALL_END",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
    const contentEvents = collector.events.filter((e) => e.type === "TEXT_MESSAGE_CONTENT") as Array<{
      delta: string;
    }>;
    expect(contentEvents.at(-1)?.delta).toBe("Done.");
  });
});
