import { z } from "zod";
import { ArtifactIdSchema } from "./id.js";
import { ClaimSchema } from "./common.js";

// Streams (SPEC.md §6, area BD) are ephemeral scheduler state — one isolated
// git worktree on its own branch + one ACP agent session + an assignment.
// Unlike everything else in this package, a Stream is NOT an OKF artifact:
// it's recoverable from the repo (branches, commits, artifact `claim`
// fields) plus a small journal (BD-014), never itself committed as a
// frontmatter document. This schema is the in-memory/journal shape the
// scheduler, merge queue, and ACP layer all share.

export const StreamStatusSchema = z.enum([
  "queued",
  "starting",
  "running",
  "paused",
  "waiting_question", // BD-012: agent question, decision point
  "waiting_permission", // AC-006/AC-013: permission or secret request
  "review", // BD-005: stream-done gate passed, awaiting acceptance/merge
  "superseded", // BD-017: story claimed/landed elsewhere
  "aborted",
  "failed",
  "done",
]);

export type StreamStatus = z.infer<typeof StreamStatusSchema>;

// BD-005's default staged pipeline: implement -> self-verify -> done.
// Profile-defined, so this is the shipped default, not a hardcoded ceiling.
export const StreamStageSchema = z.enum(["implement", "self-verify", "done"]);

export type StreamStage = z.infer<typeof StreamStageSchema>;

// Stream branch nonce (FORMATS §11 git conventions): 4-char base36, minted
// at stream start, reused as the provisional-ID nonce (FORMATS §2).
export const STREAM_NONCE_PATTERN = /^[0-9a-z]{4}$/;

export const StreamNonceSchema = z.string().regex(STREAM_NONCE_PATTERN);

export const StreamSchema = z.object({
  nonce: StreamNonceSchema,
  /** `ibos/<work-id-lower>-<nonce>`, e.g. `ibos/st-0042-a3f9`. */
  branch: z.string(),
  worktreePath: z.string(),
  /** The story, or coherent task set, this stream is assigned to (BD-001). */
  assignment: z.array(ArtifactIdSchema).min(1),
  status: StreamStatusSchema,
  stage: StreamStageSchema.optional(),
  /** Agent identity string (FORMATS §10), present once a session exists. */
  agent: z.string().optional(),
  claim: ClaimSchema.optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  /** Set when status is "superseded"/"aborted"/"failed" — a short reason a
   * human or the scheduler can act on without reading the transcript. */
  statusReason: z.string().optional(),
});

export type Stream = z.infer<typeof StreamSchema>;
