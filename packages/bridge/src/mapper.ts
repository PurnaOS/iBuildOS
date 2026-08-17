import { ComponentEnvelopeSchema } from "@ibuildos/schemas";
import type { AGUIEvent } from "./ag-ui-events.js";
import { COMPONENT_OPEN_MARKER, FENCE_CLOSE_MARKER } from "./component.js";
import { mapPermissionRequestToInterrupt, type PermissionRequestParams } from "./permission.js";

// The core ACP `session/update` -> AG-UI event mapper (T-004's event-mapping
// table). This module is pure/I-O-free by design: no stdio, no child
// processes, no `@ibuildos/stub-agent` import — `client.ts` is the layer that
// wires this to a real ACP connection. That separation is what makes a later
// swap to real ACP session/update types (or hosting this inside
// apps/desktop's IPC — deferred this round, see README) a drop-in.
//
// ACP `session/update` message chunks carry no explicit start/end — the
// mapper is a small state machine (open block kind + id) so it can emit a
// well-formed TEXT_MESSAGE_START -> CONTENT* -> TEXT_MESSAGE_END sequence
// (and the THINKING_* equivalent) rather than a naive 1:1 chunk->event map,
// which could never emit a correct END. `startTurn()`/`endTurn()` bracket one
// `session/prompt` turn; the harness (client.ts) calls both.

export interface SessionUpdate {
  kind: string;
  data: unknown;
}

interface ToolCallData {
  toolCallId: string;
  title?: string;
  kind?: string;
  status?: string;
}

function longestSuffixPrefixOverlap(buffer: string, marker: string): number {
  const maxLen = Math.min(buffer.length, marker.length - 1);
  for (let len = maxLen; len > 0; len--) {
    if (buffer.endsWith(marker.slice(0, len))) return len;
  }
  return 0;
}

export class AGUIMapper {
  private openText: { messageId: string } | null = null;
  private openThinking: { messageId: string } | null = null;
  private readonly seenToolCalls = new Set<string>();
  private nextId = 1;
  private runId: string | null = null;

  // Fenced `ibuildos:component` block scanner state (message_chunk stream
  // only — FORMATS §10 carrier B is defined over the message stream, not
  // thought chunks).
  private textPending = "";
  private inFence = false;
  private componentText = "";

  private newId(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  /** Begin one `session/prompt` turn: resets all per-turn state. */
  startTurn(): AGUIEvent[] {
    this.runId = this.newId("run");
    this.openText = null;
    this.openThinking = null;
    this.seenToolCalls.clear();
    this.textPending = "";
    this.inFence = false;
    this.componentText = "";
    return [{ type: "RUN_STARTED", runId: this.runId }];
  }

  /** End the current turn: closes any still-open streaming block, then emits RUN_FINISHED. */
  endTurn(stopReason: string): AGUIEvent[] {
    const events = this.closeOpenMessageBlocks();
    events.push({ type: "RUN_FINISHED", runId: this.runId ?? "unknown", stopReason });
    return events;
  }

  handleSessionUpdate(update: SessionUpdate): AGUIEvent[] {
    switch (update.kind) {
      case "message_chunk":
        return this.handleMessageChunk((update.data as { text: string }).text);
      case "thought_chunk":
        return this.handleThoughtChunk((update.data as { text: string }).text);
      case "tool_call":
        return this.handleToolCall(update.data as ToolCallData);
      case "plan":
        return [...this.closeOpenMessageBlocks(), { type: "STATE_DELTA", path: "/plan", value: update.data }];
      default:
        return [];
    }
  }

  /** ACP `session/request_permission` -> HITL_INTERRUPT (closes any open streaming block first). */
  handlePermissionRequest(requestId: string | number, params: PermissionRequestParams): AGUIEvent[] {
    return [...this.closeOpenMessageBlocks(), mapPermissionRequestToInterrupt(requestId, params)];
  }

  private closeOpenMessageBlocks(): AGUIEvent[] {
    const events: AGUIEvent[] = [];
    events.push(...this.closeText());
    events.push(...this.closeThinking());
    return events;
  }

  private closeText(): AGUIEvent[] {
    if (!this.openText) return [];
    const { messageId } = this.openText;
    this.openText = null;
    return [{ type: "TEXT_MESSAGE_END", messageId }];
  }

  private closeThinking(): AGUIEvent[] {
    if (!this.openThinking) return [];
    const { messageId } = this.openThinking;
    this.openThinking = null;
    return [{ type: "THINKING_END", messageId }];
  }

  private handleThoughtChunk(text: string): AGUIEvent[] {
    const events: AGUIEvent[] = [...this.closeText()];
    if (!this.openThinking) {
      const messageId = this.newId("thought");
      this.openThinking = { messageId };
      events.push({ type: "THINKING_START", messageId });
    }
    events.push({ type: "THINKING_CONTENT", messageId: this.openThinking.messageId, delta: text });
    return events;
  }

  private handleMessageChunk(text: string): AGUIEvent[] {
    const events: AGUIEvent[] = [...this.closeThinking()];
    this.textPending += text;
    events.push(...this.drainTextPending());
    return events;
  }

  private handleToolCall(data: ToolCallData): AGUIEvent[] {
    const events: AGUIEvent[] = [...this.closeOpenMessageBlocks()];
    if (!this.seenToolCalls.has(data.toolCallId)) {
      this.seenToolCalls.add(data.toolCallId);
      events.push({
        type: "TOOL_CALL_START",
        toolCallId: data.toolCallId,
        toolCallName: data.title ?? data.kind ?? "tool",
      });
    }
    if (data.status === "completed" || data.status === "failed") {
      events.push({ type: "TOOL_CALL_RESULT", toolCallId: data.toolCallId, status: data.status });
      events.push({ type: "TOOL_CALL_END", toolCallId: data.toolCallId });
    }
    return events;
  }

  private emitTextContent(text: string): AGUIEvent[] {
    const events: AGUIEvent[] = [];
    if (!this.openText) {
      const messageId = this.newId("msg");
      this.openText = { messageId };
      events.push({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
    }
    events.push({ type: "TEXT_MESSAGE_CONTENT", messageId: this.openText.messageId, delta: text });
    return events;
  }

  // The fenced-block scanner. Runs over `this.textPending`, which accumulates
  // across `session/update` message chunks — a fence marker (or the
  // component JSON itself) can and will land split across chunk boundaries
  // (see `fixtures/component-decision-card.scenario.json`), so this holds
  // back any buffer tail that could still be a partial marker prefix rather
  // than flushing prematurely.
  private drainTextPending(): AGUIEvent[] {
    const events: AGUIEvent[] = [];
    for (;;) {
      if (!this.inFence) {
        const idx = this.textPending.indexOf(COMPONENT_OPEN_MARKER);
        if (idx === -1) {
          const holdback = longestSuffixPrefixOverlap(this.textPending, COMPONENT_OPEN_MARKER);
          const flushable = this.textPending.slice(0, this.textPending.length - holdback);
          if (flushable) events.push(...this.emitTextContent(flushable));
          this.textPending = this.textPending.slice(this.textPending.length - holdback);
          return events;
        }
        const before = this.textPending.slice(0, idx);
        if (before) events.push(...this.emitTextContent(before));
        events.push(...this.closeText());
        let rest = this.textPending.slice(idx + COMPONENT_OPEN_MARKER.length);
        if (rest.startsWith("\r\n")) rest = rest.slice(2);
        else if (rest.startsWith("\n")) rest = rest.slice(1);
        this.textPending = rest;
        this.inFence = true;
        this.componentText = "";
        continue;
      }

      const closeIdx = this.textPending.indexOf(FENCE_CLOSE_MARKER);
      if (closeIdx === -1) {
        const holdback = longestSuffixPrefixOverlap(this.textPending, FENCE_CLOSE_MARKER);
        this.componentText += this.textPending.slice(0, this.textPending.length - holdback);
        this.textPending = this.textPending.slice(this.textPending.length - holdback);
        return events;
      }
      this.componentText += this.textPending.slice(0, closeIdx);
      this.textPending = this.textPending.slice(closeIdx + FENCE_CLOSE_MARKER.length);
      this.componentText = this.componentText.replace(/\n$/, "");
      events.push(...this.finishComponent(this.componentText));
      this.inFence = false;
      this.componentText = "";
    }
  }

  private finishComponent(jsonText: string): AGUIEvent[] {
    try {
      const envelope = ComponentEnvelopeSchema.parse(JSON.parse(jsonText));
      return [{ type: "GENERATIVE_UI_COMPONENT", component: envelope }];
    } catch {
      // Malformed/unparseable payload inside the fence: prose fallback
      // (GU-002's fallback posture) rather than silently dropping content.
      return this.emitTextContent(`${COMPONENT_OPEN_MARKER}\n${jsonText}\n${FENCE_CLOSE_MARKER}`);
    }
  }
}
