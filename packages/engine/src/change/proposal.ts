import { ComponentEnvelopeSchema, type ComponentEnvelope } from "@ibuildos/schemas";

// SPEC.md area M, CH-004 — "re-plan as a proposal": the downstream reconciliation for a
// Change is shaped as one reviewable change-set component (GU-004/FORMATS §10, `kind:
// "change-set"`) — stories to revise/add/retire, test cases to update — applied
// transactionally on approval. This module builds and validates that *shape*; it does
// not decide *content*. Deciding what to revise/add/retire and why is the planner
// agent's job (CH-004 proper) — a real ACP session, out of scope for this deterministic
// engine package (CLAUDE.md's "no AI/network calls inside packages/engine", TECH-STACK
// T-013). `buildChangeSetProposal` exists so that agent's output — or a human's, via the
// UI's own change-set editor — has one schema to validate against rather than each
// caller inventing a parallel shape.

/** A proposed revision to one Story (or WorkItem generally) in a re-plan. `id` is set
 * when revising or retiring an existing artifact; omitted when proposing a new one
 * (the merge/approval step, not this module, mints its final ID — FORMATS §2 KB-010). */
export interface ProposedStoryChange {
  id?: string;
  action: "revise" | "add" | "retire";
  title?: string;
  rationale: string;
  /** Requirement(s) or criterion refs (`ID#AC-n`, FORMATS §2) this revision remaps
   * `implements` to. */
  implements?: string[];
}

/** A proposed change to one TestCase. */
export interface ProposedTestCaseChange {
  id?: string;
  action: "update" | "add" | "retire";
  rationale: string;
  verifies?: string[];
}

export interface ChangeSetProposalInput {
  /** Correlates this component with its answer (FORMATS §10). */
  cid: string;
  title?: string;
  body?: string;
  /** The Change artifact (CH-002) this proposal is attached to, if one already exists. */
  change?: string;
  stories?: ProposedStoryChange[];
  testCases?: ProposedTestCaseChange[];
}

/** Shape a proposed re-plan as a `ComponentEnvelope` (`kind: "change-set"`) and validate
 * it against the shared schema (`packages/schemas`) — never a parallel, unvalidated
 * shape. Throws a `ZodError` if the caller-supplied pieces don't fit the envelope
 * (e.g. a missing `cid`). */
export function buildChangeSetProposal(input: ChangeSetProposalInput): ComponentEnvelope {
  const envelope: Record<string, unknown> = {
    v: 1,
    kind: "change-set",
    cid: input.cid,
    stories: input.stories ?? [],
    testCases: input.testCases ?? [],
  };
  if (input.title !== undefined) envelope.title = input.title;
  if (input.body !== undefined) envelope.body = input.body;
  if (input.change !== undefined) envelope.change = input.change;

  return ComponentEnvelopeSchema.parse(envelope);
}
