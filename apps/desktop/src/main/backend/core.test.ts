import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreBackend } from "./core.js";

describe("CoreBackend", () => {
  let backend: CoreBackend;

  beforeEach(() => {
    vi.useFakeTimers();
    backend = new CoreBackend();
  });

  afterEach(() => {
    backend.dispose();
    vi.useRealTimers();
  });

  it("seeds a non-empty project list", () => {
    expect(backend.listProjects().length).toBeGreaterThan(0);
  });

  it("creates a project in an in-progress state that becomes ready shortly after", () => {
    const created = backend.createProject({ name: "Field Ops", template: "web-app" });
    expect(created.checksStatus).toBe("in-progress");
    expect(backend.getProject(created.id)).toEqual(created);

    vi.advanceTimersByTime(1_500);

    const settled = backend.getProject(created.id);
    expect(settled?.checksStatus).toBe("ready");
  });

  it("opening a missing project throws", () => {
    expect(() => backend.openProject("does-not-exist")).toThrow();
  });

  it("getProject returns null (not undefined/throw) for a missing id", () => {
    expect(backend.getProject("does-not-exist")).toBeNull();
  });

  it("subscribeActivity delivers scripted beats, filtered by project when asked", () => {
    const seeded = backend.listProjects();
    const targetId = seeded[0]!.id;

    const allEvents: unknown[] = [];
    const unsubscribeAll = backend.subscribeActivity(undefined, (e) => allEvents.push(e));

    const filteredEvents: unknown[] = [];
    const unsubscribeFiltered = backend.subscribeActivity(targetId, (e) => filteredEvents.push(e));

    vi.advanceTimersByTime(4_000 * 5);

    expect(allEvents.length).toBeGreaterThan(0);
    expect(filteredEvents.every((e) => (e as { projectId: string }).projectId === targetId)).toBe(
      true,
    );
    expect(filteredEvents.length).toBeLessThanOrEqual(allEvents.length);

    unsubscribeAll();
    unsubscribeFiltered();

    const countAfterUnsubscribe = allEvents.length;
    vi.advanceTimersByTime(4_000 * 3);
    expect(allEvents.length).toBe(countAfterUnsubscribe);
  });

  it("listAttention only returns events flagged needsAttention", () => {
    backend.createProject({ name: "Attention Check", template: "api-service" });
    vi.advanceTimersByTime(4_000 * 6);
    const items = backend.listAttention(undefined);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.needsAttention)).toBe(true);
  });
});
