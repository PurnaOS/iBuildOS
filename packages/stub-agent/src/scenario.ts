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
  kind: z.enum(["message_chunk", "thought_chunk", "tool_call", "plan"]),
  data: z.unknown(),
});

export const ScenarioSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  updates: z.array(ScenarioUpdateSchema),
  stopReason: z.enum(["end_turn", "cancelled", "max_turn_requests"]).default("end_turn"),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioUpdate = z.infer<typeof ScenarioUpdateSchema>;

export function loadScenario(raw: unknown): Scenario {
  return ScenarioSchema.parse(raw);
}
