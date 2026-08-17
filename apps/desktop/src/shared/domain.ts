import { z } from "zod";

// Desktop-app-local domain types (not part of @ibuildos/schemas — that package
// covers OKF artifact frontmatter/type-profile/config shapes per FORMATS.md;
// "Project" as a home-screen list entry is a shell concept, SPEC.md §A "PS").
//
// This scaffold backs everything with an in-memory fake (see src/main/backend/)
// — no real git/filesystem/engine calls (packages/engine has no build step yet
// and is out of scope here per the work package brief).

export const TEMPLATE_IDS = ["web-app", "api-service", "static-site"] as const;
export const TemplateIdSchema = z.enum(TEMPLATE_IDS);
export type TemplateId = z.infer<typeof TemplateIdSchema>;

export const TemplateSchema = z.object({
  id: TemplateIdSchema,
  name: z.string(),
  summary: z.string(),
  stack: z.array(z.string()),
});
export type Template = z.infer<typeof TemplateSchema>;

// T-012's initial template set — shown in the PS-004 "create project" wizard's
// template-choice step.
export const TEMPLATES: readonly Template[] = [
  {
    id: "web-app",
    name: "Web app",
    summary: "A full product with pages, a database, and a live preview.",
    stack: ["Next.js", "TypeScript", "Tailwind", "SQLite"],
  },
  {
    id: "api-service",
    name: "API service",
    summary: "A backend service with no user interface of its own.",
    stack: ["Hono", "Node", "SQLite"],
  },
  {
    id: "static-site",
    name: "Static site",
    summary: "A fast, content-first site with no backend to run.",
    stack: ["Astro", "Tailwind"],
  },
] as const;

// PS-002's "live state" summary shown on the Home project grid, in
// Product-mode vocabulary (DESIGN-CHARTER §4 — no "gate", no "branch").
export const CHECKS_STATUS = ["ready", "needs-attention", "in-progress"] as const;
export const ChecksStatusSchema = z.enum(CHECKS_STATUS);
export type ChecksStatus = z.infer<typeof ChecksStatusSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  template: TemplateIdSchema,
  createdAt: z.string().datetime({ offset: true }),
  activeBuilds: z.number().int().nonnegative(),
  pendingApprovals: z.number().int().nonnegative(),
  checksStatus: ChecksStatusSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectInputSchema = z.object({
  name: z.string().trim().min(1, "Name your project.").max(120),
  template: TemplateIdSchema,
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

// The live-activity / attention-queue stream (PS-008/PS-009). One event shape
// feeds both surfaces: the attention queue is the subsequence with
// needsAttention: true.
export const ACTIVITY_KINDS = ["note", "question", "approval", "check"] as const;
export const ActivityKindSchema = z.enum(ACTIVITY_KINDS);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;

export const ActivityEventSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  kind: ActivityKindSchema,
  message: z.string(),
  occurredAt: z.string().datetime({ offset: true }),
  needsAttention: z.boolean(),
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

// The "streams" domain (SPEC.md §9.F "BD" — Build Orchestration). Hand-mirrors
// @ibuildos/schemas's StreamStatusSchema/StreamStageSchema string vocabulary
// (packages/schemas/src/stream.ts) so this scaffold's fake state won't need
// reshaping once wired to the real engine — but, per Wave 1 convention, this
// file defines its own copy rather than importing that package. "Stream" is
// an internal term only (DESIGN-CHARTER §4's glossary bans the word in
// rendered Product-mode text — call it a "build" there); every string field
// below (summary/statusReason) is rendered verbatim in Product mode, so
// scripted copy in src/main/backend/streams.ts must stay glossary-clean too.

export const STREAM_STATUSES = [
  "queued",
  "starting",
  "running",
  "paused",
  "waiting_question", // BD-012: agent question, decision point
  "waiting_permission", // AC-006/AC-013: permission or secret request
  "review", // BD-005: stream-done gate passed, awaiting acceptance
  "superseded", // BD-017: story claimed/landed elsewhere
  "aborted",
  "failed",
  "done",
] as const;
export const StreamStatusSchema = z.enum(STREAM_STATUSES);
export type StreamStatus = z.infer<typeof StreamStatusSchema>;

// BD-005's default staged pipeline: implement -> self-verify -> done.
export const STREAM_STAGES = ["implement", "self-verify", "done"] as const;
export const StreamStageSchema = z.enum(STREAM_STAGES);
export type StreamStage = z.infer<typeof StreamStageSchema>;

// BD-004's autonomy dial, per project (overridable per run — not modeled in
// this scaffold, which tracks one dial per project).
export const AUTONOMY_DIALS = ["step", "cruise", "auto"] as const;
export const AutonomyDialSchema = z.enum(AUTONOMY_DIALS);
export type AutonomyDial = z.infer<typeof AutonomyDialSchema>;

// BD-012: "the stream shall enter a waiting state, surface the question
// through generative UI ... and resume on answer." `options` absent means a
// free-text answer (e.g. the steering-style textbox); present means a
// decision card with fixed choices (GU-005).
export const StreamQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(z.string()).min(1).optional(),
});
export type StreamQuestion = z.infer<typeof StreamQuestionSchema>;

// D-115: "auto waives the acceptance and merge stops ... each waiver recorded
// as dial-waived and queued for after-the-fact review." `mode` mirrors
// packages/schemas/src/flow.ts's ReviewFrontmatterSchema.mode enum value
// literally ("dial-waived"), so a real Review artifact can absorb this record
// without reshaping it later.
export const DIAL_WAIVED_KINDS = ["acceptance", "merge"] as const;
export const DialWaivedKindSchema = z.enum(DIAL_WAIVED_KINDS);
export type DialWaivedKind = z.infer<typeof DialWaivedKindSchema>;

export const DialWaivedRecordSchema = z.object({
  id: z.string(),
  streamId: z.string(),
  projectId: z.string(),
  storyName: z.string(),
  kind: DialWaivedKindSchema,
  mode: z.literal("dial-waived"),
  waivedAt: z.string().datetime({ offset: true }),
  reviewed: z.boolean(),
});
export type DialWaivedRecord = z.infer<typeof DialWaivedRecordSchema>;

// BD-013: "offer one-click remediation paths (retry task, send instruction,
// open in Engineering mode, abort)." "Open in Engineering mode" is a pure
// navigation action (mode switch), not a backend call, so it isn't a member
// here.
export const REMEDIATION_ACTIONS = ["retry", "steer", "abort"] as const;
export const RemediationActionSchema = z.enum(REMEDIATION_ACTIONS);
export type RemediationAction = z.infer<typeof RemediationActionSchema>;

export const StreamProgressSchema = z.object({
  tasksDone: z.number().int().nonnegative(),
  tasksTotal: z.number().int().positive(),
});
export type StreamProgress = z.infer<typeof StreamProgressSchema>;

export const StreamTestsStatusSchema = z.enum(["passing", "failing", "pending"]);
export type StreamTestsStatus = z.infer<typeof StreamTestsStatusSchema>;

export const StreamSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  /** The story (or coherent task set) being built, in product terms
   * (BD-001/BD-010) — never a branch name. */
  storyName: z.string(),
  status: StreamStatusSchema,
  stage: StreamStageSchema.optional(),
  progress: StreamProgressSchema,
  testsStatus: StreamTestsStatusSchema,
  /** BD-010's "current summarized action" — rendered verbatim in Product
   * mode, so scripted copy must stay glossary-clean. */
  summary: z.string(),
  /** Present iff status === "waiting_question" (BD-012). */
  question: StreamQuestionSchema.optional(),
  /** A short, actionable reason — set when status is "failed"/"aborted"/
   * "superseded" (mirrors packages/schemas/src/stream.ts's statusReason). */
  statusReason: z.string().optional(),
  /** Bounded, newest-first log of steering instructions sent into this
   * stream (BD-008) — "visible in the transcript" without this scaffold
   * needing a real transcript. */
  notes: z.array(z.string()),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Stream = z.infer<typeof StreamSchema>;
