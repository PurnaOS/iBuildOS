import { z } from "zod";
import { ChecksStatusSchema } from "../../domain.js";

// The "insights" domain's requests — dashboards, workload, brownfield
// adoption burndown, "my queue", and (light) team coordination. See
// ../../../main/backend/insights.ts for the backend these are validated
// against. Spread into the root `requests` map in ../contract.ts.
//
// Unlike attention.ts's optional projectId (a cross-project feed you can
// narrow), every insights slice here is a per-project dashboard reached from
// inside one project's window (DESIGN-CHARTER §2's "Insights" section has no
// cross-project equivalent screen) — so projectId is required, matching
// projects.get/projects.open's pattern in projects.ts.
//
// This file is the single source of truth for the insights domain's shapes
// (zod schema + its z.infer type): the backend imports the types below
// (type-only — no runtime zod dependency crosses into ../../../main/backend/)
// instead of redeclaring structurally-identical interfaces by hand.

const ProjectScopedInput = z.object({ projectId: z.string() });

// ---------- Progress dashboard (IN-001) ----------

export const StoryStatusCountsSchema = z.object({
  draft: z.number().int().nonnegative(),
  ready: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
});
export type StoryStatusCounts = z.infer<typeof StoryStatusCountsSchema>;

// Reuses domain.ts's ChecksStatusSchema (ready / needs-attention / in-progress)
// so a release's readiness renders through the same StatusBadge component as
// a project's own checksStatus — one vocabulary, one widget.
export const ReleaseReadinessSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: ChecksStatusSchema,
});
export type ReleaseReadiness = z.infer<typeof ReleaseReadinessSchema>;

export const ProgressSnapshotSchema = z.object({
  projectId: z.string(),
  requirements: z.object({
    total: z.number().int().nonnegative(),
    built: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
  }),
  stories: StoryStatusCountsSchema,
  activeBuilds: z.number().int().nonnegative(),
  releases: z.array(ReleaseReadinessSchema),
});
export type ProgressSnapshot = z.infer<typeof ProgressSnapshotSchema>;

// ---------- Quality dashboard (IN-002) ----------

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

export const QualitySnapshotSchema = z.object({
  projectId: z.string(),
  coveragePercent: z.number().min(0).max(100),
  checksPassing: z.number().int().nonnegative(),
  checksTotal: z.number().int().nonnegative(),
  findingsBySeverity: z.object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  }),
  suitesPassing: z.number().int().nonnegative(),
  suitesTotal: z.number().int().nonnegative(),
  flaggedUnreliable: z.number().int().nonnegative(),
});
export type QualitySnapshot = z.infer<typeof QualitySnapshotSchema>;

// ---------- Human workload view (IN-008) ----------

export const WorkloadEntrySchema = z.object({
  personId: z.string(),
  personName: z.string(),
  assigned: z.number().int().nonnegative(),
  pendingReview: z.number().int().nonnegative(),
  pendingAcceptance: z.number().int().nonnegative(),
});
export type WorkloadEntry = z.infer<typeof WorkloadEntrySchema>;

export const WorkloadSnapshotSchema = z.object({
  projectId: z.string(),
  people: z.array(WorkloadEntrySchema),
});
export type WorkloadSnapshot = z.infer<typeof WorkloadSnapshotSchema>;

// ---------- Brownfield adoption burndown (IN-006 / BF-006) ----------

export const AdoptionBurndownPointSchema = z.object({
  date: z.string(),
  remaining: z.number().int().nonnegative(),
});
export type AdoptionBurndownPoint = z.infer<typeof AdoptionBurndownPointSchema>;

export const AdoptionProgressSchema = z.object({
  projectId: z.string(),
  isAdopted: z.boolean(),
  baselineTotal: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  adoptedScopePercent: z.number().min(0).max(100),
  backfillCompletePercent: z.number().min(0).max(100),
  burndown: z.array(AdoptionBurndownPointSchema),
});
export type AdoptionProgress = z.infer<typeof AdoptionProgressSchema>;

// ---------- My queue (TM-004) ----------

export const QUEUE_ITEM_KINDS = ["assignment", "review", "acceptance", "follow-up"] as const;
export const QueueItemKindSchema = z.enum(QUEUE_ITEM_KINDS);
export type QueueItemKind = z.infer<typeof QueueItemKindSchema>;

export const QueueItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  kind: QueueItemKindSchema,
  title: z.string(),
  context: z.string(),
  waitingSince: z.string().datetime({ offset: true }),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const MyQueueSchema = z.object({
  projectId: z.string(),
  personName: z.string(),
  items: z.array(QueueItemSchema),
});
export type MyQueue = z.infer<typeof MyQueueSchema>;

// ---------- Team coordination (TM-009, light) ----------

export const COORDINATION_KINDS = ["meeting", "standup"] as const;
export const CoordinationKindSchema = z.enum(COORDINATION_KINDS);
export type CoordinationKind = z.infer<typeof CoordinationKindSchema>;

export const CoordinationNoteSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: CoordinationKindSchema,
  title: z.string(),
  summary: z.string(),
  occurredAt: z.string().datetime({ offset: true }),
});
export type CoordinationNote = z.infer<typeof CoordinationNoteSchema>;

export const TeamNotesSchema = z.object({
  projectId: z.string(),
  notes: z.array(CoordinationNoteSchema),
});
export type TeamNotes = z.infer<typeof TeamNotesSchema>;

export const insightsRequests = {
  "insights.progress": {
    input: ProjectScopedInput,
    output: ProgressSnapshotSchema,
  },
  "insights.quality": {
    input: ProjectScopedInput,
    output: QualitySnapshotSchema,
  },
  "insights.workload": {
    input: ProjectScopedInput,
    output: WorkloadSnapshotSchema,
  },
  "insights.adoption": {
    input: ProjectScopedInput,
    output: AdoptionProgressSchema,
  },
  "insights.my-queue": {
    input: ProjectScopedInput,
    output: MyQueueSchema,
  },
  "insights.team-notes": {
    input: ProjectScopedInput,
    output: TeamNotesSchema,
  },
} as const;
