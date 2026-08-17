import type { ComponentEnvelope } from "@ibuildos/schemas";

// A minimal, hand-rolled AG-UI-shaped event union (TECH-STACK.md T-004).
//
// `@ag-ui/*` is pre-1.0 and not yet installed anywhere in this repo (T-004's
// hardening note: exact pins required once adopted). This type intentionally
// mirrors the real protocol's SCREAMING_SNAKE discriminant convention and its
// start/content/end triads for streaming blocks (TEXT_MESSAGE_*, THINKING_*)
// plus STATE_DELTA for shared-state — so swapping in `@ag-ui/core`'s actual
// event types later is a mechanical rename, not a redesign. Two kinds
// (HITL_INTERRUPT, GENERATIVE_UI_COMPONENT) are iBuildOS-specific extensions
// layered on top for the GU-012 component convention and the
// session/request_permission human-in-the-loop mapping — AG-UI has no
// first-party equivalent of either (T-004's "Risk owned" section).

export type AGUIRole = "assistant";

export interface TextMessageStartEvent {
  type: "TEXT_MESSAGE_START";
  messageId: string;
  role: AGUIRole;
}

export interface TextMessageContentEvent {
  type: "TEXT_MESSAGE_CONTENT";
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent {
  type: "TEXT_MESSAGE_END";
  messageId: string;
}

export interface ThinkingStartEvent {
  type: "THINKING_START";
  messageId: string;
}

export interface ThinkingContentEvent {
  type: "THINKING_CONTENT";
  messageId: string;
  delta: string;
}

export interface ThinkingEndEvent {
  type: "THINKING_END";
  messageId: string;
}

export interface ToolCallStartEvent {
  type: "TOOL_CALL_START";
  toolCallId: string;
  toolCallName: string;
}

export interface ToolCallResultEvent {
  type: "TOOL_CALL_RESULT";
  toolCallId: string;
  status: "completed" | "failed";
}

export interface ToolCallEndEvent {
  type: "TOOL_CALL_END";
  toolCallId: string;
}

// ACP `session/update` plan updates -> AG-UI shared-state deltas (T-004's
// event-mapping table). `path` follows JSON-Patch-ish addressing so a richer
// shared-state store can later diff/merge multiple delta sources; `value` is
// the plan payload as the agent sent it (shape not yet pinned to a schema —
// S-1/M3 concern per stub-agent's scenario.ts note).
export interface StateDeltaEvent {
  type: "STATE_DELTA";
  path: string;
  value: unknown;
}

// ACP `session/request_permission` -> AG-UI human-in-the-loop interrupt
// (T-004: "human-in-the-loop interrupt -> approval component -> response").
// `interruptId` is the ACP request's own JSON-RPC id (stringified) so the
// answer can be correlated back to the exact pending request.
export interface HitlInterruptEvent {
  type: "HITL_INTERRUPT";
  interruptId: string;
  toolCall: unknown;
  options: Array<{ id: string; label: string }>;
}

// GU-012 component-emission convention -> AG-UI generative-UI event, typed
// payload straight from `@ibuildos/schemas` (FORMATS.md §10 / T-004's
// "our component emissions (GU catalog) -> generative-UI components (typed)").
export interface GenerativeUiComponentEvent {
  type: "GENERATIVE_UI_COMPONENT";
  component: ComponentEnvelope;
}

export interface RunStartedEvent {
  type: "RUN_STARTED";
  runId: string;
}

export interface RunFinishedEvent {
  type: "RUN_FINISHED";
  runId: string;
  stopReason: string;
}

export type AGUIEvent =
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ThinkingStartEvent
  | ThinkingContentEvent
  | ThinkingEndEvent
  | ToolCallStartEvent
  | ToolCallResultEvent
  | ToolCallEndEvent
  | StateDeltaEvent
  | HitlInterruptEvent
  | GenerativeUiComponentEvent
  | RunStartedEvent
  | RunFinishedEvent;
