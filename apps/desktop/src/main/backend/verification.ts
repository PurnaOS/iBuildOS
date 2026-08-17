import { randomUUID } from "node:crypto";
import type {
  AcceptanceChecklist,
  AcceptanceDecision,
  MergeOutcome,
  MergeResult,
  PreviewState,
  TestCaseResult,
  TestRun,
  VerificationUpdate,
} from "../../shared/ipc/contract/verification.js";

// The "verification" domain (previews/tests/acceptance/merge -- SPEC.md's
// PV/TX/RV areas plus IG-003's auto-integration) -- the in-memory fake
// standing in for a real preview process, a real test runner, and a real
// git merge (all out of scope for this scaffold, same posture as
// ../backend/core.ts). Everything is keyed by a plain string `targetId` --
// a project id or a stream id -- this file never imports
// ../backend/streams.ts, by design (see that file's placeholder comment).
//
// Unlike CoreBackend, the constructor here does no work and starts no
// timer: a freshly constructed VerificationBackend owns zero timers until
// an explicit action (startTestRun, rerunCase, finishAndCombine) schedules
// one, and every scheduled timer is tracked in `timers` so dispose() can
// cancel it. That matters because apps/desktop/src/renderer/test/
// fakeIbuildos.ts constructs one of these per test and nothing there calls
// dispose() on it explicitly beyond what the existing CoreBackend teardown
// already does -- an ambient interval here would leak into every renderer
// test, not just this domain's own.
//
// Composed into the Backend facade by ./index.ts; every IPC handler for
// this domain (../ipc/verification.ts) is backed by this one class.

interface StorySeed {
  name: string;
  summary: string;
  criteria: ReadonlyArray<{ id: string; description: string }>;
}

// Two named demo targets (ids shared with the renderer via
// ../../shared/ipc/contract/verification.ts's DEMO_TARGET_IDS) so the UI has
// something richer than lorem ipsum without depending on the sibling
// "streams" work package's real list -- storyFor's fallback below still
// gives any other targetId (e.g. a future real stream id) a sensible
// generic story.
const DEMO_STORIES: Readonly<Record<string, StorySeed>> = {
  "demo-story-offline-sync": {
    name: "Offline sync",
    summary:
      "Field techs can keep working without a connection; edits reconcile once they're back online.",
    criteria: [
      { id: "case-sign-in", description: "Users can sign in and stay signed in offline" },
      { id: "case-queue-edits", description: "Edits made offline are queued and applied on reconnect" },
      { id: "case-conflict-prompt", description: "Conflicting edits ask which version to keep" },
    ],
  },
  "demo-story-legacy-import": {
    name: "Legacy data import",
    summary: "Bulk-imports existing equipment records from the old system.",
    criteria: [
      { id: "case-import-csv", description: "A CSV of equipment records imports without errors" },
      { id: "case-dedupe", description: "Duplicate records are flagged, not silently merged" },
    ],
  },
};

function storyFor(targetId: string): StorySeed {
  const known = DEMO_STORIES[targetId];
  if (known) return known;
  return {
    name: `Story ${targetId}`,
    summary: "Built and ready for review.",
    criteria: [
      { id: `${targetId}::case-1`, description: "The primary flow works as described" },
      { id: `${targetId}::case-2`, description: "Errors are handled without crashing" },
    ],
  };
}

// Scripted, deterministic outcomes (not random) so both the UI demo and
// this file's own tests are repeatable: the "legacy import" demo target
// is the one or two things this scaffold shows going wrong.
function caseShouldFail(targetId: string, caseId: string): boolean {
  return targetId === "demo-story-legacy-import" && caseId === "case-dedupe";
}

function mergeOutcomeFor(targetId: string): MergeOutcome {
  return targetId === "demo-story-legacy-import" || targetId.includes("conflict")
    ? "conflict-needs-attention"
    : "success";
}

function previewUrlFor(targetId: string): string {
  return `https://localhost:4180/preview/${encodeURIComponent(targetId)}`;
}

function overallStatus(cases: readonly TestCaseResult[]): "passed" | "failed" {
  return cases.some((c) => c.status === "failed") ? "failed" : "passed";
}

const RUN_START_MS = 200;
const CASE_STEP_MS = 350;
const COMBINE_MS = 500;

type Listener = { targetId: string; emit: (update: VerificationUpdate) => void };

export class VerificationBackend {
  private readonly previews = new Map<string, PreviewState>();
  private readonly testRuns = new Map<string, TestRun>();
  private readonly acceptance = new Map<string, AcceptanceChecklist>();
  private readonly merges = new Map<string, MergeResult>();
  private readonly listeners = new Set<Listener>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  // -- preview (PV-001..009) --------------------------------------------

  getPreview(targetId: string): PreviewState {
    return this.ensurePreview(targetId);
  }

  /** PV-003/PV-009: re-run the seed/migrate step and refresh freshness --
   * always lands back on "seeded" so acceptance never happens unknowingly
   * against stale data. */
  refreshPreview(targetId: string): PreviewState {
    const story = storyFor(targetId);
    const refreshed: PreviewState = {
      targetId,
      kind: "web",
      url: previewUrlFor(targetId),
      versionLabel: `${story.name} — updated just now`,
      lastUpdatedAt: new Date().toISOString(),
      dataState: "seeded",
    };
    this.previews.set(targetId, refreshed);
    this.publish(targetId, { kind: "preview", preview: refreshed });
    return refreshed;
  }

  // -- automated tests (TX-001..008) -------------------------------------

  getTestRun(targetId: string): TestRun | null {
    return this.testRuns.get(targetId) ?? null;
  }

  /** TX-001/TX-002: pending -> running -> per-case pending -> running ->
   * passed/failed -> overall passed/failed, each transition published on
   * "verification.updates" and echoed into the bound acceptance checklist
   * (RV-004). */
  startTestRun(targetId: string): TestRun {
    const story = storyFor(targetId);
    const run: TestRun = {
      id: randomUUID(),
      targetId,
      status: "pending",
      startedAt: null,
      finishedAt: null,
      cases: story.criteria.map((c) => ({ id: c.id, name: c.description, status: "pending", detail: null })),
    };
    this.testRuns.set(targetId, run);
    this.syncAcceptanceWithRun(targetId);
    this.publish(targetId, { kind: "testRun", run });

    this.schedule(RUN_START_MS, () => {
      const current = this.testRuns.get(targetId);
      if (!current || current.id !== run.id) return;
      const running: TestRun = { ...current, status: "running", startedAt: new Date().toISOString() };
      this.testRuns.set(targetId, running);
      this.publish(targetId, { kind: "testRun", run: running });
      this.runCaseAt(targetId, run.id, 0);
    });

    return run;
  }

  /** TX-003: failed tests are re-runnable individually -- scripted to fix
   * the flake (always resolves to "passed"), so the loop demoed is
   * run -> see a red case -> fix -> re-run -> green -> criterion verifies. */
  rerunCase(targetId: string, caseId: string): TestRun {
    const run = this.testRuns.get(targetId);
    if (!run) throw new Error(`No test run for "${targetId}" yet — run the tests first.`);
    const index = run.cases.findIndex((c) => c.id === caseId);
    if (index === -1) throw new Error(`No test case "${caseId}" in this run.`);

    const runningCases = run.cases.map((c, i) => (i === index ? { ...c, status: "running" as const, detail: null } : c));
    const running: TestRun = { ...run, status: "running", finishedAt: null, cases: runningCases };
    this.testRuns.set(targetId, running);
    this.syncAcceptanceWithRun(targetId);
    this.publish(targetId, { kind: "testRun", run: running });

    this.schedule(CASE_STEP_MS, () => {
      const current = this.testRuns.get(targetId);
      if (!current || current.id !== run.id) return;
      const resolvedCases = current.cases.map((c, i) => (i === index ? { ...c, status: "passed" as const, detail: null } : c));
      const finished: TestRun = {
        ...current,
        cases: resolvedCases,
        status: overallStatus(resolvedCases),
        finishedAt: new Date().toISOString(),
      };
      this.testRuns.set(targetId, finished);
      this.syncAcceptanceWithRun(targetId);
      this.publish(targetId, { kind: "testRun", run: finished });
    });

    return running;
  }

  private runCaseAt(targetId: string, runId: string, caseIndex: number): void {
    const current = this.testRuns.get(targetId);
    if (!current || current.id !== runId) return;

    if (caseIndex >= current.cases.length) {
      const finished: TestRun = {
        ...current,
        status: overallStatus(current.cases),
        finishedAt: new Date().toISOString(),
      };
      this.testRuns.set(targetId, finished);
      this.syncAcceptanceWithRun(targetId);
      this.publish(targetId, { kind: "testRun", run: finished });
      return;
    }

    const runningCases = current.cases.map((c, i) => (i === caseIndex ? { ...c, status: "running" as const } : c));
    const running: TestRun = { ...current, cases: runningCases };
    this.testRuns.set(targetId, running);
    this.publish(targetId, { kind: "testRun", run: running });

    this.schedule(CASE_STEP_MS, () => {
      const beforeResolve = this.testRuns.get(targetId);
      if (!beforeResolve || beforeResolve.id !== runId) return;
      const targetCase = beforeResolve.cases[caseIndex];
      if (!targetCase) return;
      const failed = caseShouldFail(targetId, targetCase.id);
      const resolvedCases = beforeResolve.cases.map((c, i) => {
        if (i !== caseIndex) return c;
        return failed
          ? { ...c, status: "failed" as const, detail: "Two records matched but neither was flagged." }
          : { ...c, status: "passed" as const, detail: null };
      });
      const resolved: TestRun = { ...beforeResolve, cases: resolvedCases };
      this.testRuns.set(targetId, resolved);
      this.syncAcceptanceWithRun(targetId);
      this.publish(targetId, { kind: "testRun", run: resolved });
      this.runCaseAt(targetId, runId, caseIndex + 1);
    });
  }

  // -- acceptance (RV-003/RV-004/RV-007) --------------------------------

  getAcceptance(targetId: string): AcceptanceChecklist {
    return this.ensureAcceptance(targetId);
  }

  /** RV-003: accept / request changes / reject. Accepting is gated on
   * every criterion being verified or waived -- the UI-level analogue of
   * IG-001's "story acceptance satisfied" merge-gate clause. RV-007: every
   * decision is recorded (who, when). */
  decide(targetId: string, decision: AcceptanceDecision, note?: string, actor?: string): AcceptanceChecklist {
    const checklist = this.ensureAcceptance(targetId);
    if (decision === "accepted") {
      const unresolved = checklist.criteria.filter((c) => c.status === "unverified");
      if (unresolved.length > 0) {
        throw new Error(
          `${unresolved.length} acceptance ${unresolved.length === 1 ? "criterion isn't" : "criteria aren't"} verified yet.`,
        );
      }
    }
    const decided: AcceptanceChecklist = {
      ...checklist,
      decision,
      decidedAt: new Date().toISOString(),
      decidedBy: actor ?? "You",
      note: note ?? null,
    };
    this.acceptance.set(targetId, decided);
    this.publish(targetId, { kind: "acceptance", checklist: decided });
    return decided;
  }

  /** RV-004: an explicit human waiver is valid evidence in place of a
   * passing test, recorded with reason + who + when (RV-007). */
  waiveCriterion(targetId: string, criterionId: string, reason: string, actor?: string): AcceptanceChecklist {
    const checklist = this.ensureAcceptance(targetId);
    const index = checklist.criteria.findIndex((c) => c.id === criterionId);
    if (index === -1) throw new Error(`No acceptance criterion "${criterionId}".`);
    const criteria = checklist.criteria.map((c, i) =>
      i === index
        ? {
            ...c,
            status: "waived" as const,
            waiverReason: reason,
            waivedBy: actor ?? "You",
            waivedAt: new Date().toISOString(),
          }
        : c,
    );
    const updated: AcceptanceChecklist = { ...checklist, criteria };
    this.acceptance.set(targetId, updated);
    this.publish(targetId, { kind: "acceptance", checklist: updated });
    return updated;
  }

  /** RV-004's binding, kept live: a criterion is "verified" exactly when
   * its linked test case's current status is "passed" -- recomputed (not
   * snapshotted) on every test-run change, except for criteria a human has
   * already waived, which stay waived regardless of what the tests do. */
  private syncAcceptanceWithRun(targetId: string): void {
    const checklist = this.ensureAcceptance(targetId);
    const run = this.testRuns.get(targetId);
    const criteria = checklist.criteria.map((c) => {
      if (c.status === "waived") return c;
      const linkedCase = run?.cases.find((tc) => tc.id === c.testCaseId);
      return { ...c, status: linkedCase?.status === "passed" ? ("verified" as const) : ("unverified" as const) };
    });
    const updated: AcceptanceChecklist = { ...checklist, criteria };
    this.acceptance.set(targetId, updated);
    this.publish(targetId, { kind: "acceptance", checklist: updated });
  }

  // -- merge / "finish & combine" (IG-003) -------------------------------

  getMerge(targetId: string): MergeResult {
    return this.ensureMerge(targetId);
  }

  /** IG-003: merge per the dial -- here, always the one-click approver
   * path. Requires acceptance first (IG-001's merge-gate clause, enforced
   * client-side by this fake same as a real gate would). Resolves after a
   * short delay to a fake outcome: conflict-free and green -> "combined";
   * otherwise -> "needs-attention", in Product-mode vocabulary throughout
   * (DESIGN-CHARTER §4 bans "merge"/"merge conflict" there). */
  finishAndCombine(targetId: string, actor?: string): MergeResult {
    const checklist = this.ensureAcceptance(targetId);
    if (checklist.decision !== "accepted") {
      throw new Error("Accept the story before combining it with the live product.");
    }
    // decide()'s gate only ran at the moment of acceptance -- syncAcceptanceWithRun
    // can flip a criterion back to "unverified" afterward (e.g. someone
    // re-runs tests and a previously-passing case now fails), so re-check
    // here too. IG-001's merge-gate clause is "tests passing *and* story
    // acceptance satisfied," not just the latter.
    const stillUnresolved = checklist.criteria.filter((c) => c.status === "unverified");
    if (stillUnresolved.length > 0) {
      throw new Error(
        `${stillUnresolved.length} acceptance ${stillUnresolved.length === 1 ? "criterion isn't" : "criteria aren't"} verified anymore — check the tests before combining.`,
      );
    }
    void actor; // Not yet surfaced on MergeResult -- attribution lives on the acceptance decision (RV-007).

    const combining: MergeResult = {
      ...this.ensureMerge(targetId),
      status: "combining",
      outcome: null,
      combinedAt: null,
      message: "Combining with the live product…",
    };
    this.merges.set(targetId, combining);
    this.publish(targetId, { kind: "merge", result: combining });

    this.schedule(COMBINE_MS, () => {
      const outcome = mergeOutcomeFor(targetId);
      const settled: MergeResult =
        outcome === "success"
          ? {
              targetId,
              status: "combined",
              outcome,
              combinedAt: new Date().toISOString(),
              message: "Combined with the live product.",
            }
          : {
              targetId,
              status: "needs-attention",
              outcome,
              combinedAt: null,
              message: "These changes need reconciling before they can join the live product.",
            };
      this.merges.set(targetId, settled);
      this.publish(targetId, { kind: "merge", result: settled });
    });

    return combining;
  }

  // -- subscriptions -------------------------------------------------

  subscribe(targetId: string, emit: (update: VerificationUpdate) => void): () => void {
    const listener: Listener = { targetId, emit };
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // -- internals -----------------------------------------------------

  private schedule(delayMs: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, delayMs);
    this.timers.add(timer);
  }

  private publish(targetId: string, update: VerificationUpdate): void {
    for (const listener of this.listeners) {
      if (listener.targetId === targetId) listener.emit(update);
    }
  }

  private ensurePreview(targetId: string): PreviewState {
    const existing = this.previews.get(targetId);
    if (existing) return existing;
    const story = storyFor(targetId);
    const seeded: PreviewState = {
      targetId,
      kind: "web",
      url: previewUrlFor(targetId),
      versionLabel: `${story.name} — updated just now`,
      lastUpdatedAt: new Date().toISOString(),
      dataState: "seeded",
    };
    this.previews.set(targetId, seeded);
    return seeded;
  }

  private ensureAcceptance(targetId: string): AcceptanceChecklist {
    const existing = this.acceptance.get(targetId);
    if (existing) return existing;
    const story = storyFor(targetId);
    const seeded: AcceptanceChecklist = {
      targetId,
      storyName: story.name,
      summary: story.summary,
      criteria: story.criteria.map((c) => ({
        id: c.id,
        description: c.description,
        testCaseId: c.id,
        status: "unverified",
        waiverReason: null,
        waivedBy: null,
        waivedAt: null,
      })),
      decision: "pending",
      decidedAt: null,
      decidedBy: null,
      note: null,
    };
    this.acceptance.set(targetId, seeded);
    return seeded;
  }

  private ensureMerge(targetId: string): MergeResult {
    const existing = this.merges.get(targetId);
    if (existing) return existing;
    const seeded: MergeResult = {
      targetId,
      status: "idle",
      outcome: null,
      combinedAt: null,
      message: "Ready to combine once the story is accepted.",
    };
    this.merges.set(targetId, seeded);
    return seeded;
  }
}
