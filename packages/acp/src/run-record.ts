import { RunFrontmatterSchema, type RunFrontmatter } from "@ibuildos/schemas";
import { formatAgentIdentity, transcriptUri, type AgentIdentity } from "./identity.js";

// BD-011/AC-012 — a record of one agent execution: assignment, agent
// identity, started/ended, outcome, gate results, transcript reference.
// Reuses `packages/schemas`' `RunFrontmatterSchema` (FORMATS §9) rather than
// inventing a parallel shape — this module only *builds* a value that
// schema accepts; it does not mint artifact IDs (KB-010's provisional-ID
// allocation is the merge queue's job, out of this package's scope) or
// write the file (that's an OKF-store concern in packages/engine).

export interface RunRecordInput {
  /** Caller-supplied — provisional (`RN-p<nonce>-<n>`) inside a stream, or
   * final once landed (KB-010). This package doesn't allocate either. */
  id: string;
  title: string;
  /** A User/Team artifact id (`US-…`/`TM-…`) — whoever's run this is
   * attributed to; the ACP layer doesn't decide ownership policy. */
  owner: string;
  /** Profile-defined state vocabulary value; this package doesn't own the
   * profile, so it's a passthrough string, not an enum. */
  state: string;
  identity: AgentIdentity;
  role?: string;
  stream?: string;
  subject: string[];
  started: string;
  ended?: string;
  outcome?: RunFrontmatter["outcome"];
  gates?: RunFrontmatter["gates"];
  projectId: string;
  provenance?: RunFrontmatter["provenance"];
  created?: string;
}

export function buildRunFrontmatter(input: RunRecordInput): RunFrontmatter {
  return RunFrontmatterSchema.parse({
    type: "Run",
    id: input.id,
    title: input.title,
    state: input.state,
    owner: input.owner,
    provenance: input.provenance ?? "agent",
    created: input.created ?? new Date().toISOString().slice(0, 10),
    agent: formatAgentIdentity(input.identity),
    role: input.role,
    stream: input.stream,
    subject: input.subject,
    started: input.started,
    ended: input.ended,
    outcome: input.outcome,
    gates: input.gates ?? {},
    transcript: transcriptUri(input.projectId, input.id),
  });
}
