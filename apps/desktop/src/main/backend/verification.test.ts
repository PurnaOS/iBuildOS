import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerificationBackend } from "./verification.js";
import {
  AcceptanceChecklistSchema,
  MergeResultSchema,
  PreviewStateSchema,
  TestRunSchema,
  VerificationUpdateSchema,
  type VerificationUpdate,
} from "../../shared/ipc/contract/verification.js";

describe("VerificationBackend", () => {
  let backend: VerificationBackend;

  beforeEach(() => {
    vi.useFakeTimers();
    backend = new VerificationBackend();
  });

  afterEach(() => {
    backend.dispose();
    vi.useRealTimers();
  });

  describe("preview", () => {
    it("seeds a preview lazily on first read, already seeded and pointed at the target", () => {
      const preview = backend.getPreview("demo-story-offline-sync");
      expect(preview.dataState).toBe("seeded");
      expect(preview.url).toContain("demo-story-offline-sync");
      expect(preview.versionLabel).toContain("Offline sync");
    });

    it("refresh always lands back on seeded and bumps lastUpdatedAt", () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const first = backend.getPreview("demo-story-offline-sync");

      vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
      const refreshed = backend.refreshPreview("demo-story-offline-sync");

      expect(refreshed.dataState).toBe("seeded");
      expect(refreshed.lastUpdatedAt).not.toBe(first.lastUpdatedAt);
    });

    it("gives an arbitrary (non-demo) targetId a sensible generic preview", () => {
      const preview = backend.getPreview("stream-abc123");
      expect(preview.url).toContain("stream-abc123");
    });
  });

  describe("test runs", () => {
    it("has no run before one is started", () => {
      expect(backend.getTestRun("demo-story-offline-sync")).toBeNull();
    });

    it("transitions pending -> running -> passed, resolving each case in turn", async () => {
      const run = backend.startTestRun("demo-story-offline-sync");
      expect(run.status).toBe("pending");
      expect(run.cases.every((c) => c.status === "pending")).toBe(true);

      await vi.advanceTimersByTimeAsync(200);
      expect(backend.getTestRun("demo-story-offline-sync")?.status).toBe("running");

      // 3 cases * 350ms to flip to "running" then resolve; advance well past all of them.
      await vi.advanceTimersByTimeAsync(350 * 6);

      const finished = backend.getTestRun("demo-story-offline-sync");
      expect(finished?.status).toBe("passed");
      expect(finished?.cases.every((c) => c.status === "passed")).toBe(true);
      expect(finished?.finishedAt).not.toBeNull();
    });

    it("the legacy-import demo target fails its dedupe case", async () => {
      backend.startTestRun("demo-story-legacy-import");
      await vi.advanceTimersByTimeAsync(200 + 350 * 4);

      const finished = backend.getTestRun("demo-story-legacy-import");
      expect(finished?.status).toBe("failed");
      const dedupe = finished?.cases.find((c) => c.id === "case-dedupe");
      expect(dedupe?.status).toBe("failed");
      expect(dedupe?.detail).not.toBeNull();
    });

    it("rerunning a failed case is scripted to fix it, flipping the run back to passed (TX-003)", async () => {
      backend.startTestRun("demo-story-legacy-import");
      await vi.advanceTimersByTimeAsync(200 + 350 * 4);
      expect(backend.getTestRun("demo-story-legacy-import")?.status).toBe("failed");

      backend.rerunCase("demo-story-legacy-import", "case-dedupe");
      await vi.advanceTimersByTimeAsync(350);

      const finished = backend.getTestRun("demo-story-legacy-import");
      expect(finished?.status).toBe("passed");
      expect(finished?.cases.find((c) => c.id === "case-dedupe")?.status).toBe("passed");
    });

    it("rerunning an unknown case throws", () => {
      backend.startTestRun("demo-story-offline-sync");
      expect(() => backend.rerunCase("demo-story-offline-sync", "no-such-case")).toThrow();
    });

    it("rerunning before any run exists throws", () => {
      expect(() => backend.rerunCase("demo-story-offline-sync", "case-sign-in")).toThrow();
    });
  });

  describe("acceptance (RV-003/RV-004)", () => {
    it("criteria stay unverified until their linked test case passes, then flip live", async () => {
      backend.startTestRun("demo-story-offline-sync");
      let checklist = backend.getAcceptance("demo-story-offline-sync");
      expect(checklist.criteria.every((c) => c.status === "unverified")).toBe(true);

      await vi.advanceTimersByTimeAsync(200 + 350); // first case resolves
      checklist = backend.getAcceptance("demo-story-offline-sync");
      const verifiedSoFar = checklist.criteria.filter((c) => c.status === "verified");
      expect(verifiedSoFar.length).toBe(1);
      expect(verifiedSoFar[0]?.id).toBe("case-sign-in");

      await vi.advanceTimersByTimeAsync(350 * 4); // remaining cases resolve
      checklist = backend.getAcceptance("demo-story-offline-sync");
      expect(checklist.criteria.every((c) => c.status === "verified")).toBe(true);
    });

    it("rejects accepting until every criterion is verified or waived", async () => {
      backend.startTestRun("demo-story-offline-sync");
      expect(() => backend.decide("demo-story-offline-sync", "accepted")).toThrow();

      await vi.advanceTimersByTimeAsync(200 + 350 * 4);
      const checklist = backend.decide("demo-story-offline-sync", "accepted", undefined, "Priya");
      expect(checklist.decision).toBe("accepted");
      expect(checklist.decidedBy).toBe("Priya");
      expect(checklist.decidedAt).not.toBeNull();
    });

    it("always allows requesting changes or rejecting, gate or no gate", () => {
      const checklist = backend.decide("demo-story-offline-sync", "changes-requested", "Please add a spinner");
      expect(checklist.decision).toBe("changes-requested");
      expect(checklist.note).toBe("Please add a spinner");
    });

    it("a waiver substitutes for a passing test and is recorded (RV-007)", () => {
      const before = backend.getAcceptance("demo-story-offline-sync");
      const criterionId = before.criteria[0]!.id;

      const waived = backend.waiveCriterion("demo-story-offline-sync", criterionId, "Verified manually", "Priya");
      const criterion = waived.criteria.find((c) => c.id === criterionId);
      expect(criterion?.status).toBe("waived");
      expect(criterion?.waiverReason).toBe("Verified manually");
      expect(criterion?.waivedBy).toBe("Priya");
      expect(criterion?.waivedAt).not.toBeNull();
    });

    it("waiving an unknown criterion throws", () => {
      expect(() => backend.waiveCriterion("demo-story-offline-sync", "no-such-criterion", "n/a")).toThrow();
    });

    it("a waived criterion stays waived even if its test later fails", async () => {
      const before = backend.getAcceptance("demo-story-legacy-import");
      const dedupeCriterion = before.criteria.find((c) => c.testCaseId === "case-dedupe")!;
      backend.waiveCriterion("demo-story-legacy-import", dedupeCriterion.id, "Known issue, tracked separately");

      backend.startTestRun("demo-story-legacy-import");
      await vi.advanceTimersByTimeAsync(200 + 350 * 4);

      const after = backend.getAcceptance("demo-story-legacy-import");
      expect(after.criteria.find((c) => c.id === dedupeCriterion.id)?.status).toBe("waived");
    });
  });

  describe("finish & combine (IG-003)", () => {
    it("refuses to combine before the story is accepted", () => {
      expect(() => backend.finishAndCombine("demo-story-offline-sync")).toThrow(/accept/i);
    });

    it("resolves to combined for a clean target", async () => {
      backend.startTestRun("demo-story-offline-sync");
      await vi.advanceTimersByTimeAsync(200 + 350 * 4);
      backend.decide("demo-story-offline-sync", "accepted");

      const combining = backend.finishAndCombine("demo-story-offline-sync");
      expect(combining.status).toBe("combining");

      await vi.advanceTimersByTimeAsync(500);
      const result = backend.getMerge("demo-story-offline-sync");
      expect(result.status).toBe("combined");
      expect(result.outcome).toBe("success");
      expect(result.combinedAt).not.toBeNull();
      expect(result.message.toLowerCase()).not.toContain("merge");
    });

    it("resolves to needs-attention for the legacy-import demo target", async () => {
      backend.startTestRun("demo-story-legacy-import");
      await vi.advanceTimersByTimeAsync(200 + 350 * 3);
      const dedupeCriterion = backend
        .getAcceptance("demo-story-legacy-import")
        .criteria.find((c) => c.testCaseId === "case-dedupe")!;
      backend.waiveCriterion("demo-story-legacy-import", dedupeCriterion.id, "Tracked separately");
      backend.decide("demo-story-legacy-import", "accepted");

      backend.finishAndCombine("demo-story-legacy-import");
      await vi.advanceTimersByTimeAsync(500);

      const result = backend.getMerge("demo-story-legacy-import");
      expect(result.status).toBe("needs-attention");
      expect(result.outcome).toBe("conflict-needs-attention");
      expect(result.combinedAt).toBeNull();
      expect(result.message.toLowerCase()).not.toContain("merge");
    });
  });

  describe("subscriptions & lifecycle", () => {
    it("delivers updates scoped to the subscribed targetId only", async () => {
      const forOfflineSync: VerificationUpdate[] = [];
      const forLegacyImport: VerificationUpdate[] = [];
      const stop1 = backend.subscribe("demo-story-offline-sync", (u) => forOfflineSync.push(u));
      const stop2 = backend.subscribe("demo-story-legacy-import", (u) => forLegacyImport.push(u));

      backend.startTestRun("demo-story-offline-sync");
      await vi.advanceTimersByTimeAsync(200 + 350 * 4);

      expect(forOfflineSync.length).toBeGreaterThan(0);
      expect(forLegacyImport.length).toBe(0);

      stop1();
      stop2();
    });

    it("unsubscribe stops further delivery", async () => {
      const events: VerificationUpdate[] = [];
      const stop = backend.subscribe("demo-story-offline-sync", (u) => events.push(u));
      backend.startTestRun("demo-story-offline-sync");
      await vi.advanceTimersByTimeAsync(200 + 350);
      const countAfterFirstCase = events.length;
      stop();

      await vi.advanceTimersByTimeAsync(350 * 4);
      expect(events.length).toBe(countAfterFirstCase);
    });

    it("dispose cancels every pending timer, freezing state where it stood", async () => {
      backend.startTestRun("demo-story-offline-sync");
      await vi.advanceTimersByTimeAsync(200); // now "running", no case resolved yet
      const beforeDispose = backend.getTestRun("demo-story-offline-sync");

      backend.dispose();
      await vi.advanceTimersByTimeAsync(350 * 10);

      expect(backend.getTestRun("demo-story-offline-sync")).toEqual(beforeDispose);
    });
  });

  // Nothing in this file's other tests calls through the router (they call
  // backend methods directly), and ../ipc/verification.test.ts calls the
  // handler functions directly too -- so no Vitest suite otherwise proves
  // this domain's outputs actually satisfy the zod schemas the real IPC
  // router validates against (registerIpcRouter's def.output.safeParse /
  // def.event.safeParse in ../../shared/ipc/router.ts). The Playwright
  // walkthrough (../../../e2e/smoke.spec.ts) proves it end to end for the
  // happy path, but not every update `kind`. This closes that gap directly.
  describe("wire schema conformance", () => {
    it("every getter's return value satisfies its response schema", () => {
      expect(PreviewStateSchema.safeParse(backend.getPreview("demo-story-offline-sync")).success).toBe(true);
      expect(PreviewStateSchema.safeParse(backend.refreshPreview("demo-story-offline-sync")).success).toBe(true);
      expect(TestRunSchema.safeParse(backend.startTestRun("demo-story-offline-sync")).success).toBe(true);
      expect(AcceptanceChecklistSchema.safeParse(backend.getAcceptance("demo-story-offline-sync")).success).toBe(
        true,
      );
      expect(MergeResultSchema.safeParse(backend.getMerge("demo-story-offline-sync")).success).toBe(true);
    });

    it("every published update, across a full run/waive/decide/combine flow, satisfies VerificationUpdateSchema, and all four kinds appear", async () => {
      const targetId = "demo-story-legacy-import";
      const updates: VerificationUpdate[] = [];
      const stop = backend.subscribe(targetId, (u) => updates.push(u));

      backend.refreshPreview(targetId);
      backend.startTestRun(targetId);
      await vi.advanceTimersByTimeAsync(200 + 350 * 3); // dedupe case fails

      const dedupeCriterion = backend
        .getAcceptance(targetId)
        .criteria.find((c) => c.testCaseId === "case-dedupe")!;
      backend.waiveCriterion(targetId, dedupeCriterion.id, "Tracked separately");
      backend.decide(targetId, "accepted");

      backend.finishAndCombine(targetId);
      await vi.advanceTimersByTimeAsync(500); // legacy-import always resolves to conflict

      stop();

      expect(updates.length).toBeGreaterThan(0);
      for (const update of updates) {
        const parsed = VerificationUpdateSchema.safeParse(update);
        expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error?.issues)).toBe(true);
      }

      const kindsSeen = new Set(updates.map((u) => u.kind));
      expect(kindsSeen).toEqual(new Set(["preview", "testRun", "acceptance", "merge"]));
    });
  });
});
