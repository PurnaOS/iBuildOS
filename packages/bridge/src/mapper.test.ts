import { describe, expect, it } from "vitest";
import { AGUIMapper } from "./mapper.js";
import type { AGUIEvent } from "./ag-ui-events.js";
import componentScenario from "../fixtures/component-decision-card.scenario.json" with { type: "json" };

describe("AGUIMapper — text + tool call ordering", () => {
  it("maps a hello-world-style turn (message chunks + a completed tool call) to an ordered AG-UI sequence", () => {
    const mapper = new AGUIMapper();
    const events: AGUIEvent[] = [];

    events.push(...mapper.startTurn());
    events.push(...mapper.handleSessionUpdate({ kind: "message_chunk", data: { text: "Hello" } }));
    events.push(...mapper.handleSessionUpdate({ kind: "message_chunk", data: { text: ", world." } }));
    events.push(
      ...mapper.handleSessionUpdate({
        kind: "tool_call",
        data: { toolCallId: "tc-1", title: "List files", kind: "read", status: "completed" },
      }),
    );
    events.push(...mapper.endTurn("end_turn"));

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

    const start = events[1];
    const c1 = events[2];
    const c2 = events[3];
    const end = events[4];
    expect(start).toMatchObject({ type: "TEXT_MESSAGE_START", role: "assistant" });
    expect(c1).toMatchObject({ delta: "Hello" });
    expect(c2).toMatchObject({ delta: ", world." });
    expect(end).toMatchObject({ messageId: (start as { messageId: string }).messageId });
    expect(c1).toMatchObject({ messageId: (start as { messageId: string }).messageId });

    const toolStart = events[5];
    expect(toolStart).toMatchObject({
      type: "TOOL_CALL_START",
      toolCallId: "tc-1",
      toolCallName: "List files",
    });
    expect(events[6]).toMatchObject({ type: "TOOL_CALL_RESULT", toolCallId: "tc-1", status: "completed" });
    expect(events[7]).toMatchObject({ type: "TOOL_CALL_END", toolCallId: "tc-1" });

    const finished = events[8] as { type: "RUN_FINISHED"; stopReason: string };
    expect(finished.stopReason).toBe("end_turn");
  });

  it("closes an open thinking block before starting a text block, and vice versa", () => {
    const mapper = new AGUIMapper();
    const events: AGUIEvent[] = [];
    events.push(...mapper.startTurn());
    events.push(...mapper.handleSessionUpdate({ kind: "thought_chunk", data: { text: "hmm" } }));
    events.push(...mapper.handleSessionUpdate({ kind: "message_chunk", data: { text: "ok" } }));
    events.push(...mapper.endTurn("end_turn"));

    expect(events.map((e) => e.type)).toEqual([
      "RUN_STARTED",
      "THINKING_START",
      "THINKING_CONTENT",
      "THINKING_END",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
  });

  it("maps a plan update to a STATE_DELTA event, closing any open text block first", () => {
    const mapper = new AGUIMapper();
    const events: AGUIEvent[] = [];
    events.push(...mapper.startTurn());
    events.push(...mapper.handleSessionUpdate({ kind: "message_chunk", data: { text: "Planning…" } }));
    events.push(
      ...mapper.handleSessionUpdate({ kind: "plan", data: { steps: ["a", "b"] } }),
    );
    events.push(...mapper.endTurn("end_turn"));

    expect(events.map((e) => e.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "STATE_DELTA",
      "RUN_FINISHED",
    ]);
    expect(events[4]).toMatchObject({ type: "STATE_DELTA", path: "/plan", value: { steps: ["a", "b"] } });
  });
});

describe("AGUIMapper — GU-012 fenced component carrier", () => {
  it("buffers a fenced ibuildos:component block split across message chunks, flushing pre-fence text first and resuming text after", () => {
    const mapper = new AGUIMapper();
    const events: AGUIEvent[] = [];
    events.push(...mapper.startTurn());
    for (const update of componentScenario.updates) {
      events.push(...mapper.handleSessionUpdate(update));
    }
    events.push(...mapper.endTurn("end_turn"));

    expect(events.map((e) => e.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "GENERATIVE_UI_COMPONENT",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);

    expect(events[2]).toMatchObject({ delta: "Let's decide.\n" });

    const componentEvent = events[4] as {
      type: "GENERATIVE_UI_COMPONENT";
      component: { v: 1; kind: string; cid: string; title?: string };
    };
    expect(componentEvent.component).toMatchObject({
      v: 1,
      kind: "decision-card",
      cid: "q1",
      title: "Sync conflict policy?",
    });

    expect(events[6]).toMatchObject({ delta: "\nThanks." });
    // The second text block is a distinct message from the first.
    expect((events[1] as { messageId: string }).messageId).not.toBe(
      (events[5] as { messageId: string }).messageId,
    );
  });

  it("falls back to prose when the fenced block doesn't parse as a valid component envelope", () => {
    const mapper = new AGUIMapper();
    const events: AGUIEvent[] = [];
    events.push(...mapper.startTurn());
    events.push(
      ...mapper.handleSessionUpdate({
        kind: "message_chunk",
        data: { text: "```ibuildos:component\nnot json\n```" },
      }),
    );
    events.push(...mapper.endTurn("end_turn"));

    expect(events.map((e) => e.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
    expect(events[2]).toMatchObject({ delta: "```ibuildos:component\nnot json\n```" });
  });
});

describe("AGUIMapper — session/request_permission", () => {
  it("maps a permission request to HITL_INTERRUPT, closing any open text block first", () => {
    const mapper = new AGUIMapper();
    const events: AGUIEvent[] = [];
    events.push(...mapper.startTurn());
    events.push(
      ...mapper.handleSessionUpdate({ kind: "message_chunk", data: { text: "I'll need to run tests." } }),
    );
    events.push(
      ...mapper.handlePermissionRequest("agent-1", {
        toolCall: { toolCallId: "tc-1", title: "Run tests" },
        options: [
          { id: "allow", label: "Allow" },
          { id: "reject", label: "Reject" },
        ],
      }),
    );

    expect(events.map((e) => e.type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "HITL_INTERRUPT",
    ]);
    expect(events[4]).toMatchObject({
      type: "HITL_INTERRUPT",
      interruptId: "agent-1",
      options: [{ id: "allow", label: "Allow" }, { id: "reject", label: "Reject" }],
    });
  });
});
