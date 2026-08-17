import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamsBackend } from "./streams.js";

// Mirrors ./core.test.ts's style (fake timers, dispose in afterEach) for the
// streams domain: seeded build variety, the autonomy dial (BD-004), agent
// questions (BD-012), steering (BD-008), and failure remediation (BD-013).

const EQUIPMENT_PROJECT = "seed-equipment-inspections";
const FIELD_SYNC_PROJECT = "seed-field-sync-api";

describe("StreamsBackend", () => {
  let backend: StreamsBackend;

  beforeEach(() => {
    vi.useFakeTimers();
    backend = new StreamsBackend();
  });

  afterEach(() => {
    backend.dispose();
    vi.useRealTimers();
  });

  it("seeds a non-empty, varied stream list per project", () => {
    const equipment = backend.listStreams(EQUIPMENT_PROJECT);
    expect(equipment.length).toBeGreaterThan(0);
    const statuses = new Set(equipment.map((s) => s.status));
    expect(statuses.size).toBeGreaterThan(1);

    expect(backend.listStreams(FIELD_SYNC_PROJECT).length).toBeGreaterThan(0);
    expect(backend.listStreams("does-not-exist")).toEqual([]);
  });

  it("getStream returns null (not undefined/throw) for a missing id", () => {
    expect(backend.getStream("does-not-exist")).toBeNull();
  });

  it("defaults the autonomy dial to cruise (DEFAULTS.md #1) and lets it be set per project", () => {
    expect(backend.getDial(EQUIPMENT_PROJECT)).toBe("cruise");
    expect(backend.setDial(EQUIPMENT_PROJECT, "auto")).toBe("auto");
    expect(backend.getDial(EQUIPMENT_PROJECT)).toBe("auto");
    // Per-project: setting one project's dial doesn't affect another's.
    expect(backend.getDial(FIELD_SYNC_PROJECT)).toBe("cruise");
  });

  it("advances a running build task by task, parking at review under cruise (BD-004/BD-005)", () => {
    const before = backend.getStream("seed-stream-offline-capture")!;
    expect(before.status).toBe("running");
    expect(before.progress).toEqual({ tasksDone: 2, tasksTotal: 5 });

    // Only one seeded stream is eligible to advance (the rest are
    // waiting_question/review/failed/done), so every 3s tick moves exactly
    // this one forward by one task.
    vi.advanceTimersByTime(3_000);
    expect(backend.getStream("seed-stream-offline-capture")!.progress.tasksDone).toBe(3);

    vi.advanceTimersByTime(3_000 * 2);
    const done = backend.getStream("seed-stream-offline-capture")!;
    expect(done.progress).toEqual({ tasksDone: 5, tasksTotal: 5 });
    expect(done.status).toBe("review");
    expect(done.testsStatus).toBe("passing");
    expect(backend.listDialWaived(EQUIPMENT_PROJECT)).toEqual([]);
  });

  it("auto waives acceptance on completion and records it for after-the-fact review (D-115)", () => {
    backend.setDial(EQUIPMENT_PROJECT, "auto");
    vi.advanceTimersByTime(3_000 * 3);

    const finished = backend.getStream("seed-stream-offline-capture")!;
    expect(finished.status).toBe("done");

    const waived = backend.listDialWaived(EQUIPMENT_PROJECT);
    expect(waived).toHaveLength(1);
    expect(waived[0]).toMatchObject({
      streamId: "seed-stream-offline-capture",
      kind: "acceptance",
      mode: "dial-waived",
      reviewed: false,
    });

    const reviewed = backend.markDialWaivedReviewed(waived[0]!.id);
    expect(reviewed.reviewed).toBe(true);
    expect(backend.listDialWaived(EQUIPMENT_PROJECT)[0]!.reviewed).toBe(true);
  });

  it("answerQuestion resumes a waiting build only for its current question (BD-012)", () => {
    const streamId = "seed-stream-report-export";
    expect(backend.getStream(streamId)!.status).toBe("waiting_question");

    expect(() => backend.answerQuestion(streamId, "not-the-question", "Ask the user")).toThrow();

    const resumed = backend.answerQuestion(streamId, "q-sync-conflict", "Ask the user");
    expect(resumed.status).toBe("running");
    expect(resumed.question).toBeUndefined();
    expect(resumed.notes[0]).toContain("Ask the user");
  });

  it("steer sends an instruction into any active build, visible as a note (BD-008)", () => {
    const steered = backend.steer("seed-stream-offline-capture", "Use the existing date utils");
    expect(steered.notes[0]).toBe("You said: Use the existing date utils");

    // Still allowed while waiting on a question — steering and answering are
    // independent; the question itself is untouched.
    const stillWaiting = backend.steer("seed-stream-report-export", "Keep it simple");
    expect(stillWaiting.status).toBe("waiting_question");
    expect(stillWaiting.notes[0]).toBe("You said: Keep it simple");

    expect(() => backend.steer("seed-stream-release-changelog", "too late")).toThrow();
  });

  it("remediate retries a stopped build, resuming from its last task (BD-013/BD-014)", () => {
    const streamId = "seed-stream-sync-conflict-resolution";
    const before = backend.getStream(streamId)!;
    expect(before.status).toBe("failed");

    const retried = backend.remediate(streamId, "retry");
    expect(retried.status).toBe("running");
    expect(retried.statusReason).toBeUndefined();
    expect(retried.progress).toEqual(before.progress); // resumed, not restarted

    expect(() => backend.remediate(streamId, "retry")).toThrow(); // no longer failed
  });

  it("remediate steer requires an instruction and applies it as a note", () => {
    const streamId = "seed-stream-sync-conflict-resolution";
    expect(() => backend.remediate(streamId, "steer")).toThrow();

    const steered = backend.remediate(streamId, "steer", "Skip the offline queue for now");
    expect(steered.status).toBe("running");
    expect(steered.notes[0]).toBe("You said: Skip the offline queue for now");
  });

  it("remediate abort stops a build and keeps a reason, without discarding it silently", () => {
    const streamId = "seed-stream-sync-conflict-resolution";
    const aborted = backend.remediate(streamId, "abort");
    expect(aborted.status).toBe("aborted");
    expect(aborted.statusReason).toBeTruthy();

    expect(() => backend.remediate("seed-stream-offline-capture", "abort")).toThrow(); // not failed
  });

  it("subscribeStreams delivers updates, filtered by project, and stops on unsubscribe", () => {
    const allEvents: unknown[] = [];
    const unsubscribeAll = backend.subscribeStreams(undefined, (s) => allEvents.push(s));

    const filteredEvents: unknown[] = [];
    const unsubscribeFiltered = backend.subscribeStreams(EQUIPMENT_PROJECT, (s) =>
      filteredEvents.push(s),
    );

    // A direct mutation on a different project must not reach the filtered
    // listener.
    backend.remediate("seed-stream-sync-conflict-resolution", "retry");
    expect(filteredEvents).toHaveLength(0);
    expect(allEvents).toHaveLength(1);

    vi.advanceTimersByTime(3_000);
    expect(filteredEvents.length).toBeGreaterThan(0);
    expect(
      filteredEvents.every((e) => (e as { projectId: string }).projectId === EQUIPMENT_PROJECT),
    ).toBe(true);

    unsubscribeAll();
    unsubscribeFiltered();

    const countAfter = allEvents.length;
    backend.steer("seed-stream-offline-capture", "one more thing");
    expect(allEvents.length).toBe(countAfter);
  });
});
