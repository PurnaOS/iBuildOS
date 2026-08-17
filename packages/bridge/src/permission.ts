import type { HitlInterruptEvent } from "./ag-ui-events.js";

// ACP `session/request_permission` is agent-initiated: a JSON-RPC *request*
// arriving on the bridge's inbound connection from the agent process (the
// stub agent's `sendRequest`, real agents via the ACP SDK), not a
// `session/update` notification. It blocks the agent's replay/turn until the
// bridge answers — see stub-agent's agent.ts `replayScenario()`, which awaits
// `sendRequest(METHOD.sessionRequestPermission, ...)` mid-turn.

export interface PermissionOption {
  id: string;
  label: string;
}

export interface PermissionRequestParams {
  sessionId?: string;
  toolCall: unknown;
  options: PermissionOption[];
}

/**
 * Map an inbound `session/request_permission` request to the AG-UI
 * human-in-the-loop interrupt event (T-004: "session/request_permission ->
 * human-in-the-loop interrupt -> approval component -> response").
 * `requestId` is the JSON-RPC request's own id — carried through as
 * `interruptId` so the eventual answer can be written back with the exact id
 * the agent's `sendRequest` is awaiting.
 */
export function mapPermissionRequestToInterrupt(
  requestId: string | number,
  params: PermissionRequestParams,
): HitlInterruptEvent {
  return {
    type: "HITL_INTERRUPT",
    interruptId: String(requestId),
    toolCall: params.toolCall,
    options: params.options,
  };
}

export type PermissionAnswerResult =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

/**
 * Encode the human's choice as the JSON-RPC *result* the agent's pending
 * `sendRequest` is awaiting. Shape matches what stub-agent's own test suite
 * sends back (`agent.test.ts`: `{ outcome: "selected", optionId: "allow" }`)
 * — this is the ACP `session/request_permission` response shape, not an
 * AG-UI event; the bridge's JSON-RPC client (`client.ts`) writes it directly
 * as `{ jsonrpc, id: interruptId, result }` on the connection back to the
 * agent process.
 */
export function encodePermissionAnswer(optionId: string): PermissionAnswerResult {
  return { outcome: "selected", optionId };
}

export function encodePermissionCancellation(): PermissionAnswerResult {
  return { outcome: "cancelled" };
}
