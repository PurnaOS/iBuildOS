import {
  ComponentAnswerSchema,
  ComponentEnvelopeSchema,
  SecretGrantSchema,
  type ComponentAnswer,
  type ComponentEnvelope,
  type SecretGrant,
} from "@ibuildos/schemas";
import { z } from "zod";

// FORMATS.md §10 — GU-012 component-emission convention, carrier B (fenced
// fallback in the message stream): a fenced code block with info string
// `ibuildos:component` (envelope) or `ibuildos:answer` (the reply).
//
// `ibuildos:secret-request` is NOT named by FORMATS §10 — it names the MCP
// tool `ui_request_secret({name, reason})` as carrier A for AC-013's secret
// signal, but does not specify carrier B's fallback shape for that same
// signal (only for the general GU component catalog and its answers). This
// module's `SecretRequestFenceSchema` and the `ibuildos:secret-request` info
// string are this package's own extension of the documented convention,
// scoped narrowly to what's needed to test AC-013 against an agent that
// can't call MCP tools (e.g. a scripted fixture). The *answer* to a secret
// request is NOT invented — FORMATS §10 states it directly: a normal
// `ibuildos:answer` fence whose `response` is `{granted, env}`
// (`SecretGrantSchema`). Flagged here as a genuine judgment call worth a
// `DC-####` decision record (Builder Charter, EXECUTION-PLAN.md §1) — noted
// in this package's README rather than minted sight-unseen against a
// profile/ID scheme this package doesn't own.
export const SECRET_REQUEST_INFO_STRING = "ibuildos:secret-request";
export const COMPONENT_INFO_STRING = "ibuildos:component";
export const ANSWER_INFO_STRING = "ibuildos:answer";

export const SecretRequestFenceSchema = z.object({
  v: z.literal(1),
  cid: z.string(),
  name: z.string(),
  reason: z.string().optional(),
});
export type SecretRequestFence = z.infer<typeof SecretRequestFenceSchema>;

export interface ParsedComponentFence {
  kind: "component";
  envelope: ComponentEnvelope;
}
export interface ParsedAnswerFence {
  kind: "answer";
  answer: ComponentAnswer;
}
export interface ParsedSecretRequestFence {
  kind: "secret-request";
  request: SecretRequestFence;
}
export type ParsedFence = ParsedComponentFence | ParsedAnswerFence | ParsedSecretRequestFence;

const FENCE_PATTERN = /```([^\n`]+)\n([\s\S]*?)```/g;

/** Extracts every recognized `ibuildos:*` fenced block from a message's
 * text. Unrecognized info strings and malformed JSON inside a recognized
 * one are skipped, not thrown (GU-009: unknown/malformed components must
 * never break the surrounding conversation). */
export function parseFences(text: string): ParsedFence[] {
  const found: ParsedFence[] = [];
  for (const match of text.matchAll(FENCE_PATTERN)) {
    const info = match[1]!.trim();
    const body = match[2]!.trim();
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      continue;
    }
    if (info === COMPONENT_INFO_STRING) {
      const parsed = ComponentEnvelopeSchema.safeParse(json);
      if (parsed.success) found.push({ kind: "component", envelope: parsed.data });
    } else if (info === ANSWER_INFO_STRING) {
      const parsed = ComponentAnswerSchema.safeParse(json);
      if (parsed.success) found.push({ kind: "answer", answer: parsed.data });
    } else if (info === SECRET_REQUEST_INFO_STRING) {
      const parsed = SecretRequestFenceSchema.safeParse(json);
      if (parsed.success) found.push({ kind: "secret-request", request: parsed.data });
    }
  }
  return found;
}

export function encodeComponentFence(envelope: ComponentEnvelope): string {
  return "```" + COMPONENT_INFO_STRING + "\n" + JSON.stringify(envelope) + "\n```";
}

export function encodeAnswerFence(answer: ComponentAnswer): string {
  return "```" + ANSWER_INFO_STRING + "\n" + JSON.stringify(answer) + "\n```";
}

export function encodeSecretRequestFence(request: SecretRequestFence): string {
  return "```" + SECRET_REQUEST_INFO_STRING + "\n" + JSON.stringify(request) + "\n```";
}

/** Builds the answer fence for a granted/denied secret request — the shape
 * FORMATS §10 states explicitly: an `ibuildos:answer` envelope whose
 * `response` matches `SecretGrantSchema`. Never carries the secret value. */
export function encodeSecretGrantAnswer(cid: string, grant: SecretGrant): string {
  const parsedGrant = SecretGrantSchema.parse(grant);
  const answer: ComponentAnswer = {
    v: 1,
    cid,
    response: parsedGrant,
  };
  return encodeAnswerFence(answer);
}
