import { z } from "zod";

// A scenario is a scripted replay of what a real agent session would produce:
// a sequence of `session/update` notifications, ending in the prompt turn's
// result. Deterministic integration tests (ACP layer, AG-UI bridge, streams,
// gates) drive against this instead of a live model (TECH-STACK T-013).
//
// Note on fidelity: this is a minimal M0 skeleton proving the replay
// mechanism end to end. The exact `session/update` payload shapes here are a
// reasonable approximation, not yet verified against the official ACP SDK's
// wire types — that verification is S-1 (M3), once @agentclientprotocol/sdk
// is wired in.

export const ScenarioUpdateSchema = z.object({
  kind: z.enum(["message_chunk", "thought_chunk", "tool_call", "plan", "permission_request"]),
  data: z.unknown(),
});

// The `data` convention for a `permission_request` update: the tool call the
// agent wants permission for, and the option set the client answers with.
// Parsed on demand at replay time (agent.ts) rather than folded into
// ScenarioUpdateSchema's `data: unknown()` — that stays deliberately loose
// for the other kinds, but a malformed permission_request fixture should
// fail loudly (a JSON-RPC error) instead of shipping undefined fields on
// the wire to a real client.
export const PermissionRequestDataSchema = z.object({
  toolCall: z.unknown(),
  options: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
});

export type PermissionRequestData = z.infer<typeof PermissionRequestDataSchema>;

export const ScenarioSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  updates: z.array(ScenarioUpdateSchema),
  stopReason: z.enum(["end_turn", "cancelled", "max_turn_requests"]).default("end_turn"),
  /** Opt-in: whether this scenario answers `session/load` with a replayed
   * transcript. Reflected back honestly in `initialize`'s
   * `agentCapabilities.loadSession`, so a well-behaved client won't even
   * try `session/load` against a scenario that doesn't support it. A
   * scenario that leaves this unset gets the same JSON-RPC error an
   * unhandled method produces. */
  supportsLoad: z.boolean().default(false),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioUpdate = z.infer<typeof ScenarioUpdateSchema>;

export function loadScenario(raw: unknown): Scenario {
  return ScenarioSchema.parse(raw);
}
