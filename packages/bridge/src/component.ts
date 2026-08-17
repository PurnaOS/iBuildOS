import { ComponentAnswerSchema, type ComponentAnswer } from "@ibuildos/schemas";

// FORMATS.md §10 — carrier B (fallback), the fenced-block convention. Carrier
// A (the bundled `ibuildos-ui` MCP server) is not built in this round — see
// packages/bridge/README.md.
export const COMPONENT_FENCE_INFO = "ibuildos:component";
export const ANSWER_FENCE_INFO = "ibuildos:answer";

export const COMPONENT_OPEN_MARKER = "```" + COMPONENT_FENCE_INFO;
export const FENCE_CLOSE_MARKER = "```";

/**
 * Encode a human's answer to an emitted component as the `session/prompt`
 * content FORMATS §10 specifies: a fenced `ibuildos:answer` block carrying
 * the typed envelope, *plus* a natural-language restatement "so
 * non-convention agents still understand."
 */
export function encodeComponentAnswer(answer: ComponentAnswer): string {
  const prose = describeAnswer(answer);
  const fenced = `\`\`\`${ANSWER_FENCE_INFO}\n${JSON.stringify(answer)}\n\`\`\``;
  return `${prose}\n\n${fenced}`;
}

function describeAnswer(answer: ComponentAnswer): string {
  const responseText = JSON.stringify(answer.response);
  return `Answered component "${answer.cid}": ${responseText}`;
}

/**
 * Parse a complete (non-streamed) block of text for a fenced
 * `ibuildos:answer` block and validate it against `ComponentAnswerSchema`.
 * Used to verify what the bridge actually wrote to the wire (round-trip
 * tests) — the streaming counterpart for *incoming* `ibuildos:component`
 * blocks lives in `mapper.ts`, which has to handle a block split arbitrarily
 * across `session/update` chunks; this one operates on an already-assembled
 * string, which is all a written-then-read-back frame ever needs.
 */
export function extractAnswerBlock(content: string): ComponentAnswer | null {
  const openMarker = `\`\`\`${ANSWER_FENCE_INFO}`;
  const openIdx = content.indexOf(openMarker);
  if (openIdx === -1) return null;
  let rest = content.slice(openIdx + openMarker.length);
  if (rest.startsWith("\r\n")) rest = rest.slice(2);
  else if (rest.startsWith("\n")) rest = rest.slice(1);
  const closeIdx = rest.indexOf(FENCE_CLOSE_MARKER);
  if (closeIdx === -1) return null;
  const jsonText = rest.slice(0, closeIdx).replace(/\n$/, "");
  try {
    return ComponentAnswerSchema.parse(JSON.parse(jsonText));
  } catch {
    return null;
  }
}
