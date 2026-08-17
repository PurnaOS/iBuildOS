import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InsightsBackend } from "./insights.js";

describe("InsightsBackend", () => {
  let backend: InsightsBackend;

  beforeEach(() => {
    vi.useFakeTimers();
    backend = new InsightsBackend();
  });

  afterEach(() => {
    backend.dispose();
    vi.useRealTimers();
  });

  it("returns a seeded progress snapshot for a known project", () => {
    const progress = backend.getProgress("seed-equipment-inspections");
    expect(progress.projectId).toBe("seed-equipment-inspections");
    expect(progress.requirements.total).toBeGreaterThan(0);
    expect(progress.requirements.built).toBeLessThanOrEqual(progress.requirements.total);
    expect(progress.requirements.verified).toBeLessThanOrEqual(progress.requirements.built);
    expect(progress.requirements.pending).toBe(
      progress.requirements.total - progress.requirements.built,
    );
    const storiesTotal =
      progress.stories.draft + progress.stories.ready + progress.stories.active + progress.stories.done;
    expect(storiesTotal).toBeGreaterThan(0);
  });

  it("returns a seeded quality snapshot with findings by severity", () => {
    const quality = backend.getQuality("seed-field-sync-api");
    expect(quality.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(quality.coveragePercent).toBeLessThanOrEqual(100);
    expect(quality.checksPassing).toBeLessThanOrEqual(quality.checksTotal);
    expect(quality.findingsBySeverity.critical).toBeGreaterThanOrEqual(0);
  });

  it("returns a workload snapshot covering every team member", () => {
    const workload = backend.getWorkload("seed-equipment-inspections");
    expect(workload.people.length).toBeGreaterThan(0);
    for (const person of workload.people) {
      expect(person.personName.length).toBeGreaterThan(0);
      expect(person.assigned).toBeGreaterThanOrEqual(0);
    }
  });

  it("flags the brownfield project as adopted with a burndown series, and the greenfield project as not adopted", () => {
    const adopted = backend.getAdoptionProgress("seed-field-sync-api");
    expect(adopted.isAdopted).toBe(true);
    expect(adopted.baselineTotal).toBeGreaterThan(0);
    expect(adopted.remaining).toBeLessThanOrEqual(adopted.baselineTotal);
    expect(adopted.burndown.length).toBeGreaterThan(1);
    // A burn-DOWN: the last point should be no higher than the first.
    expect(adopted.burndown.at(-1)!.remaining).toBeLessThanOrEqual(adopted.burndown[0]!.remaining);

    const greenfield = backend.getAdoptionProgress("seed-equipment-inspections");
    expect(greenfield.isAdopted).toBe(false);
    expect(greenfield.burndown).toEqual([]);
  });

  it("returns a my-queue view scoped to the requested project, for the current user", () => {
    const queue = backend.getMyQueue("seed-field-sync-api");
    expect(queue.personName.length).toBeGreaterThan(0);
    expect(queue.items.length).toBeGreaterThan(0);
    for (const item of queue.items) {
      expect(item.projectId).toBe("seed-field-sync-api");
    }
  });

  it("grows the my-queue over time (scripted drift), bounded to a cap", () => {
    const before = backend.getMyQueue("seed-equipment-inspections").items.length;
    vi.advanceTimersByTime(6_000 * 20);
    const after = backend.getMyQueue("seed-equipment-inspections").items.length;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(6);
  });

  it("stops drifting the my-queue after dispose", () => {
    backend.getMyQueue("seed-equipment-inspections"); // ensure seeded
    vi.advanceTimersByTime(6_000);
    backend.dispose();
    const countAfterDispose = backend.getMyQueue("seed-equipment-inspections").items.length;
    vi.advanceTimersByTime(6_000 * 5);
    expect(backend.getMyQueue("seed-equipment-inspections").items.length).toBe(countAfterDispose);
  });

  it("returns (light) team notes, possibly empty for a quiet project", () => {
    const notes = backend.getTeamNotes("seed-release-notes-site");
    expect(notes.projectId).toBe("seed-release-notes-site");
    expect(Array.isArray(notes.notes)).toBe(true);
  });

  it("never throws for an unknown/freshly created project id, and is deterministic per id", () => {
    const a1 = backend.getProgress("some-new-project-id");
    const a2 = backend.getProgress("some-new-project-id");
    expect(a1).toEqual(a2);

    const b = backend.getProgress("a-different-new-id");
    // Not asserting inequality of every field (a coincidence is fine); just
    // asserting both resolve to well-formed, non-throwing snapshots.
    expect(b.projectId).toBe("a-different-new-id");
  });
});
