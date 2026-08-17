import { z } from "zod";

// The "verification" domain's IPC surface: fake preview-pane state (PV),
// scripted automated-test runs (TX), story acceptance (RV-003/004), and
// merge-to-trunk in Product-mode vocabulary (IG-003 -- "finish & combine",
// never "merge"; DESIGN-CHARTER §4). Everything here is keyed by a plain
// string `targetId` -- a project id or a stream id -- so this domain never
// imports the sibling "streams" domain's types (see
// ../../../main/backend/streams.ts's placeholder comment); it treats stream
// identity as an opaque string handed in by whatever UI is asking.
//
// Spread into the root `requests`/`channels` maps in ../contract.ts, same
// pattern as ./projects.ts/./templates.ts/./attention.ts. Backed by
// ../../../main/backend/verification.ts; wired to IPC by
// ../../../main/ipc/verification.ts.

export const PREVIEW_KINDS = ["web", "api-console", "cli-runner"] as const;
export const PreviewKindSchema = z.enum(PREVIEW_KINDS);
export type PreviewKind = z.infer<typeof PreviewKindSchema>;

// PV-009: what the preview is actually running against, so acceptance never
// happens unknowingly against stale schema/data.
export const PREVIEW_DATA_STATES = ["seeded", "migrated", "stale"] as const;
export const PreviewDataStateSchema = z.enum(PREVIEW_DATA_STATES);
export type PreviewDataState = z.infer<typeof PreviewDataStateSchema>;

export const PreviewStateSchema = z.object({
  targetId: z.string(),
  kind: PreviewKindSchema,
  url: z.string().nullable(),
  // Product-language freshness label (PV-003) -- e.g. "Offline sync --
  // updated just now" -- never a SHA/branch name.
  versionLabel: z.string(),
  lastUpdatedAt: z.string().datetime({ offset: true }),
  dataState: PreviewDataStateSchema,
});
export type PreviewState = z.infer<typeof PreviewStateSchema>;

export const TEST_CASE_STATUSES = ["pending", "running", "passed", "failed"] as const;
export const TestCaseStatusSchema = z.enum(TEST_CASE_STATUSES);
export type TestCaseStatus = z.infer<typeof TestCaseStatusSchema>;

export const TestCaseResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: TestCaseStatusSchema,
  detail: z.string().nullable(),
});
export type TestCaseResult = z.infer<typeof TestCaseResultSchema>;

export const TEST_RUN_STATUSES = ["pending", "running", "passed", "failed"] as const;
export const TestRunStatusSchema = z.enum(TEST_RUN_STATUSES);
export type TestRunStatus = z.infer<typeof TestRunStatusSchema>;

export const TestRunSchema = z.object({
  id: z.string(),
  targetId: z.string(),
  status: TestRunStatusSchema,
  startedAt: z.string().datetime({ offset: true }).nullable(),
  finishedAt: z.string().datetime({ offset: true }).nullable(),
  cases: z.array(TestCaseResultSchema),
});
export type TestRun = z.infer<typeof TestRunSchema>;

export const ACCEPTANCE_CRITERION_STATUSES = ["unverified", "verified", "waived"] as const;
export const AcceptanceCriterionStatusSchema = z.enum(ACCEPTANCE_CRITERION_STATUSES);
export type AcceptanceCriterionStatus = z.infer<typeof AcceptanceCriterionStatusSchema>;

// RV-004: each criterion links to its verifying test case; RV-007: a waiver
// records who/what/when, same audit posture as an acceptance decision.
export const AcceptanceCriterionSchema = z.object({
  id: z.string(),
  description: z.string(),
  testCaseId: z.string().nullable(),
  status: AcceptanceCriterionStatusSchema,
  waiverReason: z.string().nullable(),
  waivedBy: z.string().nullable(),
  waivedAt: z.string().datetime({ offset: true }).nullable(),
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

export const ACCEPTANCE_DECISIONS = ["pending", "accepted", "changes-requested", "rejected"] as const;
export const AcceptanceDecisionSchema = z.enum(ACCEPTANCE_DECISIONS);
export type AcceptanceDecision = z.infer<typeof AcceptanceDecisionSchema>;

export const AcceptanceChecklistSchema = z.object({
  targetId: z.string(),
  storyName: z.string(),
  // The agent's review summary (GU-007) -- notable decisions/limits, no diff
  // reading required (RV-003).
  summary: z.string(),
  criteria: z.array(AcceptanceCriterionSchema),
  decision: AcceptanceDecisionSchema,
  decidedAt: z.string().datetime({ offset: true }).nullable(),
  decidedBy: z.string().nullable(),
  note: z.string().nullable(),
});
export type AcceptanceChecklist = z.infer<typeof AcceptanceChecklistSchema>;

export const MERGE_STATUSES = ["idle", "combining", "combined", "needs-attention"] as const;
export const MergeStatusSchema = z.enum(MERGE_STATUSES);
export type MergeStatus = z.infer<typeof MergeStatusSchema>;

export const MERGE_OUTCOMES = ["success", "conflict-needs-attention"] as const;
export const MergeOutcomeSchema = z.enum(MERGE_OUTCOMES);
export type MergeOutcome = z.infer<typeof MergeOutcomeSchema>;

export const MergeResultSchema = z.object({
  targetId: z.string(),
  status: MergeStatusSchema,
  outcome: MergeOutcomeSchema.nullable(),
  combinedAt: z.string().datetime({ offset: true }).nullable(),
  // Product-mode copy (DESIGN-CHARTER §4/§5) -- e.g. "Combined with the live
  // product." / "These changes need reconciling before they can join the
  // live product." -- never "merge"/"merge conflict".
  message: z.string(),
});
export type MergeResult = z.infer<typeof MergeResultSchema>;

// Two named demo targets, shared between the backend (../../../main/backend/
// verification.ts, which seeds their story/criteria data) and the renderer
// (a target picker with no real "streams" list to draw from yet -- see the
// work package brief's note that this domain never imports the sibling
// "streams" domain's types). Kept here, not in the backend file, so the
// renderer bundle (Electron-free by construction) can reference the id list
// without importing main-process-only code.
export const DEMO_TARGET_IDS = ["demo-story-offline-sync", "demo-story-legacy-import"] as const;

const TargetInput = z.object({ targetId: z.string() });

export const verificationRequests = {
  "verification.preview.get": {
    input: TargetInput,
    output: z.object({ preview: PreviewStateSchema }),
  },
  "verification.preview.refresh": {
    input: TargetInput,
    output: z.object({ preview: PreviewStateSchema }),
  },
  "verification.tests.get": {
    input: TargetInput,
    output: z.object({ run: TestRunSchema.nullable() }),
  },
  "verification.tests.start": {
    input: TargetInput,
    output: z.object({ run: TestRunSchema }),
  },
  "verification.tests.rerunCase": {
    input: z.object({ targetId: z.string(), caseId: z.string() }),
    output: z.object({ run: TestRunSchema }),
  },
  "verification.acceptance.get": {
    input: TargetInput,
    output: z.object({ checklist: AcceptanceChecklistSchema }),
  },
  "verification.acceptance.decide": {
    input: z.object({
      targetId: z.string(),
      decision: z.enum(["accepted", "changes-requested", "rejected"]),
      note: z.string().optional(),
      actor: z.string().optional(),
    }),
    output: z.object({ checklist: AcceptanceChecklistSchema }),
  },
  "verification.acceptance.waive": {
    input: z.object({
      targetId: z.string(),
      criterionId: z.string(),
      reason: z.string(),
      actor: z.string().optional(),
    }),
    output: z.object({ checklist: AcceptanceChecklistSchema }),
  },
  "verification.merge.get": {
    input: TargetInput,
    output: z.object({ result: MergeResultSchema }),
  },
  "verification.merge.finish": {
    input: z.object({ targetId: z.string(), actor: z.string().optional() }),
    output: z.object({ result: MergeResultSchema }),
  },
} as const;

// Live updates for one target's preview/test-run/acceptance/merge state --
// one subscription channel, a discriminated-union event, the same "one
// params shape feeds a filtered event stream" pattern as
// ../attention.ts's activity.events.
export const VerificationUpdateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preview"), preview: PreviewStateSchema }),
  z.object({ kind: z.literal("testRun"), run: TestRunSchema }),
  z.object({ kind: z.literal("acceptance"), checklist: AcceptanceChecklistSchema }),
  z.object({ kind: z.literal("merge"), result: MergeResultSchema }),
]);
export type VerificationUpdate = z.infer<typeof VerificationUpdateSchema>;

export const verificationChannels = {
  "verification.updates": {
    params: TargetInput,
    event: VerificationUpdateSchema,
  },
} as const;
