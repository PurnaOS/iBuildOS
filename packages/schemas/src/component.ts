import { z } from "zod";

// FORMATS.md §10 — the generative-UI component-emission convention (GU-012).
// Catalog v1 kinds. Unknown kinds degrade to a generic rendering (GU-009), so this
// union grows without breaking older agents/clients.
export const ComponentKindSchema = z.enum([
  "question-form",
  "decision-card",
  "plan-tree",
  "change-set",
  "progress",
  "review-summary",
]);

export const DecisionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  consequence: z.string().optional(),
});

// The versioned envelope every component kind shares. Kind-specific payload keys
// (options/recommend for decision-card, items for plan-tree, …) are additive on
// top of this base — validated per-kind by the bridge, not enumerated exhaustively
// here (the catalog is meant to grow without a schema-package release per kind).
export const ComponentEnvelopeSchema = z
  .object({
    v: z.literal(1),
    kind: ComponentKindSchema,
    cid: z.string(), // correlates an emitted component with its answer
    title: z.string().optional(),
    body: z.string().optional(),
    options: z.array(DecisionOptionSchema).optional(),
    recommend: z.string().optional(),
  })
  .catchall(z.unknown());

export type ComponentEnvelope = z.infer<typeof ComponentEnvelopeSchema>;

// The answer that returns in the next session/prompt turn as a fenced
// `ibuildos:answer` block (or the MCP tool's structured result).
export const ComponentAnswerSchema = z.object({
  v: z.literal(1),
  cid: z.string(),
  response: z.record(z.string(), z.unknown()),
});

export type ComponentAnswer = z.infer<typeof ComponentAnswerSchema>;

// Secret requests never carry values in either direction (AC-013): the answer is a
// grant/deny for a named environment variable, injected out-of-band.
export const SecretGrantSchema = z.object({
  granted: z.boolean(),
  env: z.string(),
});

export type SecretGrant = z.infer<typeof SecretGrantSchema>;
