import { describe, expect, it } from "vitest";
import { ArtifactGraph, type GraphArtifact } from "../graph/graph.js";
import { Scheduler, SchedulerCycleError, codePathsCollide, type SchedulableItem } from "./scheduler.js";

function artifact(id: string, type: string, links?: Record<string, string[]>): GraphArtifact {
  return { id, type, frontmatter: links ? { links } : {} };
}

describe("Scheduler — dependency ordering", () => {
  it("starts each item only once its depends_on closure is merged, in the right order", () => {
    // A <- B <- C (C depends on B, B depends on A).
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story"),
      artifact("ST-0002", "Story", { depends_on: ["ST-0001"] }),
      artifact("ST-0003", "Story", { depends_on: ["ST-0002"] }),
    ]);
    const merged = new Set<string>();
    const started: string[] = [];
    const scheduler = new Scheduler<string>({
      graph,
      concurrency: 5,
      isDependencyMet: (id) => merged.has(id),
      startStream: (item) => {
        started.push(item.id);
        return item.id;
      },
    });

    // Listed out of dependency order on purpose — priority order must not
    // override the dependency gate.
    const items: SchedulableItem[] = [
      { id: "ST-0003", codePaths: ["src/c.ts"] },
      { id: "ST-0002", codePaths: ["src/b.ts"] },
      { id: "ST-0001", codePaths: ["src/a.ts"] },
    ];

    expect(scheduler.tick(items)).toEqual(["ST-0001"]);
    expect(scheduler.tick(items)).toEqual([]); // 0002/0003 still blocked; 0001 already active

    merged.add("ST-0001");
    expect(scheduler.tick(items)).toEqual(["ST-0002"]);

    merged.add("ST-0002");
    expect(scheduler.tick(items)).toEqual(["ST-0003"]);

    expect(started).toEqual(["ST-0001", "ST-0002", "ST-0003"]);
  });

  it("does not re-invoke startStream for an already-active item on a later tick", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story")]);
    const started: string[] = [];
    const scheduler = new Scheduler<string>({
      graph,
      concurrency: 5,
      isDependencyMet: () => true,
      startStream: (item) => {
        started.push(item.id);
        return item.id;
      },
    });
    const item = { id: "ST-0001", codePaths: ["src/a.ts"] };
    expect(scheduler.tick([item])).toEqual(["ST-0001"]);
    expect(scheduler.tick([item])).toEqual([]);
    expect(scheduler.tick([item])).toEqual([]);
    expect(started).toEqual(["ST-0001"]);
  });

  it("blocks on a depends_on target that hasn't landed on trunk yet (absent from the graph)", () => {
    // ST-0002 declares a dependency on ST-0001, but ST-0001 isn't a node in
    // this graph snapshot at all — exactly what "unmerged dependency" looks
    // like from the graph's point of view: it just isn't on trunk yet. The
    // closure must still surface it rather than silently treating a missing
    // node as "no dependency."
    const graph = new ArtifactGraph([
      artifact("ST-0002", "Story", { depends_on: ["ST-0001"] }),
    ]);

    const blocked = new Scheduler<string>({
      graph,
      concurrency: 1,
      isDependencyMet: () => false,
      startStream: (item) => item.id,
    });
    expect(blocked.readiness({ id: "ST-0002", codePaths: [] })).toEqual({
      id: "ST-0002",
      ready: false,
      reason: { kind: "dependency", blockingId: "ST-0001" },
    });
    expect(blocked.tick([{ id: "ST-0002", codePaths: [] }])).toEqual([]);

    const unblocked = new Scheduler<string>({
      graph,
      concurrency: 1,
      isDependencyMet: () => true, // caller decides the absent id counts as met
      startStream: (item) => item.id,
    });
    expect(unblocked.readiness({ id: "ST-0002", codePaths: [] })).toEqual({
      id: "ST-0002",
      ready: true,
    });
    expect(unblocked.tick([{ id: "ST-0002", codePaths: [] }])).toEqual(["ST-0002"]);
  });
});

describe("Scheduler — cycle detection", () => {
  it("throws SchedulerCycleError instead of scheduling against a cyclic depends_on graph", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { depends_on: ["ST-0002"] }),
      artifact("ST-0002", "Story", { depends_on: ["ST-0001"] }),
    ]);
    expect(
      () =>
        new Scheduler({
          graph,
          concurrency: 1,
          isDependencyMet: () => true,
          startStream: () => "handle",
        }),
    ).toThrow(SchedulerCycleError);
  });

  it("names the cyclic members in the error", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story", { depends_on: ["ST-0002"] }),
      artifact("ST-0002", "Story", { depends_on: ["ST-0001"] }),
    ]);
    try {
      new Scheduler({
        graph,
        concurrency: 1,
        isDependencyMet: () => true,
        startStream: () => "handle",
      });
      expect.fail("expected construction to throw SchedulerCycleError");
    } catch (err) {
      expect(err).toBeInstanceOf(SchedulerCycleError);
      const cycleErr = err as SchedulerCycleError;
      expect(cycleErr.cycles).toEqual([["ST-0001", "ST-0002"]]);
      expect(cycleErr.message).toContain("ST-0001");
      expect(cycleErr.message).toContain("ST-0002");
    }
  });
});

describe("Scheduler — parallelism and collision avoidance (BD-002, BD-007)", () => {
  it("starts two independent, non-colliding items in a single tick", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story"), artifact("ST-0002", "Story")]);
    const startCalls: string[] = [];
    const scheduler = new Scheduler<string>({
      graph,
      concurrency: 2,
      isDependencyMet: () => true,
      startStream: (item) => {
        startCalls.push(item.id);
        return item.id;
      },
    });
    const items = [
      { id: "ST-0001", codePaths: ["src/a.ts"] },
      { id: "ST-0002", codePaths: ["src/b.ts"] },
    ];

    expect(scheduler.tick(items)).toEqual(["ST-0001", "ST-0002"]);
    expect(startCalls).toEqual(["ST-0001", "ST-0002"]);
  });

  it("does not co-schedule two items that share a code path, even with concurrency to spare", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story"), artifact("ST-0002", "Story")]);
    const startCalls: string[] = [];
    const scheduler = new Scheduler<string>({
      graph,
      concurrency: 2,
      isDependencyMet: () => true,
      startStream: (item) => {
        startCalls.push(item.id);
        return item.id;
      },
    });
    const items = [
      { id: "ST-0001", codePaths: ["src/shared.ts"] },
      { id: "ST-0002", codePaths: ["src/shared.ts", "src/only-two.ts"] },
    ];

    // Only ST-0001 starts this pass, despite two free slots.
    expect(scheduler.tick(items)).toEqual(["ST-0001"]);
    expect(startCalls).toEqual(["ST-0001"]);
    expect(scheduler.tick(items)).toEqual([]); // ST-0002 still collides with the running ST-0001

    // Once ST-0001 is finished, the caller drops it from the candidate list
    // it hands to `tick` (a released item is eligible to be reconsidered as
    // a *fresh* candidate, same as any other pending item — it's the
    // caller's job, not the scheduler's, to know it's already done).
    scheduler.release("ST-0001");
    expect(scheduler.tick([items[1]!])).toEqual(["ST-0002"]);
    expect(startCalls).toEqual(["ST-0001", "ST-0002"]);
  });

  it("never starts more than `concurrency` items at once, checked at every start", () => {
    const graph = new ArtifactGraph(
      Array.from({ length: 5 }, (_, i) => artifact(`ST-000${i + 1}`, "Story")),
    );
    const concurrency = 2;
    const started: string[] = [];
    // A test-local "how many are live right now" counter, independent of
    // the scheduler's own bookkeeping (which only updates *after*
    // `startStream` returns — asserting against it from inside the callback
    // would be trivially true even if the scheduler over-started by one).
    // `live` is incremented here and decremented wherever the test releases
    // an id, so it observes the real invariant.
    let live = 0;
    const scheduler = new Scheduler<string>({
      graph,
      concurrency,
      isDependencyMet: () => true,
      startStream: (item) => {
        live++;
        started.push(item.id);
        expect(live).toBeLessThanOrEqual(concurrency);
        return item.id;
      },
    });
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `ST-000${i + 1}`,
      codePaths: [`src/file-${i + 1}.ts`],
    }));

    const firstBatch = scheduler.tick(items);
    expect(firstBatch).toHaveLength(concurrency);
    expect(live).toBe(concurrency);

    // At capacity: handing the same full candidate pool back starts nothing
    // more, even though three items are still pending and dependency-ready.
    expect(scheduler.tick(items)).toEqual([]);
    expect(live).toBe(concurrency);

    // Releasing one frees exactly one slot for the next pending candidate —
    // the caller drops finished ids from the pool it hands to `tick`, same
    // as the collision-avoidance test above.
    scheduler.release(firstBatch[0]!);
    live--;
    const pending = items.filter((item) => !scheduler.isActive(item.id));
    const secondBatch = scheduler.tick(pending);
    expect(secondBatch).toHaveLength(1);
    expect(live).toBe(concurrency);

    expect(started).toHaveLength(3);
  });
});

describe("Scheduler — pause/resume (BD-009)", () => {
  it("frees a concurrency slot when a stream is paused, and reclaims it on resume", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story"), artifact("ST-0002", "Story")]);
    const scheduler = new Scheduler<string>({
      graph,
      concurrency: 1,
      isDependencyMet: () => true,
      startStream: (item) => item.id,
    });
    const items = [
      { id: "ST-0001", codePaths: ["src/a.ts"] },
      { id: "ST-0002", codePaths: ["src/b.ts"] },
    ];

    expect(scheduler.tick(items)).toEqual(["ST-0001"]);
    expect(scheduler.tick(items)).toEqual([]); // at capacity

    scheduler.pause("ST-0001");
    expect(scheduler.isPaused("ST-0001")).toBe(true);
    expect(scheduler.isActive("ST-0001")).toBe(true); // still tracked, just not "running"

    expect(scheduler.tick(items)).toEqual(["ST-0002"]); // the pause freed a slot

    scheduler.resume("ST-0001");
    expect(scheduler.isPaused("ST-0001")).toBe(false);
    expect(scheduler.isActive("ST-0001")).toBe(true);
  });

  it("keeps a paused stream's code-path claim — pausing frees the slot, not the collision risk", () => {
    // BD-009: a paused stream keeps its worktree (and its uncommitted
    // changes on disk), so another item touching the same files must still
    // be treated as colliding with it even while it's paused.
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story"),
      artifact("ST-0002", "Story"),
      artifact("ST-0003", "Story"),
    ]);
    const started: string[] = [];
    const scheduler = new Scheduler<string>({
      graph,
      concurrency: 2,
      isDependencyMet: () => true,
      startStream: (item) => {
        started.push(item.id);
        return item.id;
      },
    });
    scheduler.tick([{ id: "ST-0001", codePaths: ["src/shared.ts"] }]);
    scheduler.pause("ST-0001");

    // A slot is free (1/2 running), but ST-0002 collides with the *paused*
    // ST-0001 on "src/shared.ts" and must not start.
    const colliding = { id: "ST-0002", codePaths: ["src/shared.ts"] };
    expect(scheduler.readiness(colliding)).toEqual({
      id: "ST-0002",
      ready: false,
      reason: { kind: "collision", blockingId: "ST-0001", path: "src/shared.ts" },
    });
    expect(scheduler.tick([colliding])).toEqual([]);

    // A non-colliding item, meanwhile, is free to use the slot the pause
    // opened up.
    const clear = { id: "ST-0003", codePaths: ["src/unrelated.ts"] };
    expect(scheduler.readiness(clear)).toEqual({ id: "ST-0003", ready: true });
    expect(scheduler.tick([clear])).toEqual(["ST-0003"]);

    expect(started).toEqual(["ST-0001", "ST-0003"]);
  });

  it("throws when pausing/resuming an id that isn't active, but release() is a no-op", () => {
    const scheduler = new Scheduler<string>({
      graph: new ArtifactGraph([]),
      concurrency: 1,
      isDependencyMet: () => true,
      startStream: (item) => item.id,
    });
    expect(() => scheduler.pause("ST-9999")).toThrow(/not an active stream/);
    expect(() => scheduler.resume("ST-9999")).toThrow(/not an active stream/);
    expect(() => scheduler.release("ST-9999")).not.toThrow();
  });
});

describe("Scheduler — readiness query (PL-004 dependency view)", () => {
  it("reports ready for an item with no dependencies and no collision", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story")]);
    const scheduler = new Scheduler<string>({
      graph,
      concurrency: 2,
      isDependencyMet: () => true,
      startStream: (item) => item.id,
    });
    expect(scheduler.readiness({ id: "ST-0001", codePaths: ["src/a.ts"] })).toEqual({
      id: "ST-0001",
      ready: true,
    });
  });

  it("reports the specific unmet dependency", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story"),
      artifact("ST-0002", "Story", { depends_on: ["ST-0001"] }),
    ]);
    const scheduler = new Scheduler<string>({
      graph,
      concurrency: 2,
      isDependencyMet: () => false,
      startStream: (item) => item.id,
    });
    expect(scheduler.readiness({ id: "ST-0002", codePaths: [] })).toEqual({
      id: "ST-0002",
      ready: false,
      reason: { kind: "dependency", blockingId: "ST-0001" },
    });
  });

  it("reports the specific colliding running item once dependencies are satisfied", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story"), artifact("ST-0002", "Story")]);
    const scheduler = new Scheduler<string>({
      graph,
      concurrency: 2,
      isDependencyMet: () => true,
      startStream: (item) => item.id,
    });
    scheduler.tick([{ id: "ST-0001", codePaths: ["src/a.ts"] }]);

    expect(scheduler.readiness({ id: "ST-0002", codePaths: ["src/a.ts"] })).toEqual({
      id: "ST-0002",
      ready: false,
      reason: { kind: "collision", blockingId: "ST-0001", path: "src/a.ts" },
    });
  });

  it("prefers the dependency reason over collision when both apply", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story"),
      artifact("ST-0002", "Story"),
      artifact("ST-0003", "Story", { depends_on: ["ST-0001"] }),
    ]);
    const merged = new Set<string>(); // ST-0001 never merges in this test
    const scheduler = new Scheduler<string>({
      graph,
      concurrency: 2,
      isDependencyMet: (id) => merged.has(id),
      startStream: (item) => item.id,
    });
    scheduler.tick([{ id: "ST-0002", codePaths: ["src/shared.ts"] }]);

    expect(scheduler.readiness({ id: "ST-0003", codePaths: ["src/shared.ts"] })).toEqual({
      id: "ST-0003",
      ready: false,
      reason: { kind: "dependency", blockingId: "ST-0001" },
    });
  });

  it("readinessOf reports each item in a candidate set independently", () => {
    const graph = new ArtifactGraph([
      artifact("ST-0001", "Story"),
      artifact("ST-0002", "Story", { depends_on: ["ST-0001"] }),
    ]);
    const scheduler = new Scheduler<string>({
      graph,
      concurrency: 2,
      isDependencyMet: () => false,
      startStream: (item) => item.id,
    });
    const items = [
      { id: "ST-0001", codePaths: [] },
      { id: "ST-0002", codePaths: [] },
    ];
    expect(scheduler.readinessOf(items)).toEqual([
      { id: "ST-0001", ready: true },
      { id: "ST-0002", ready: false, reason: { kind: "dependency", blockingId: "ST-0001" } },
    ]);
  });
});

describe("Scheduler — session binding", () => {
  it("calls sessionFor once per start and stores the result for lookup", () => {
    const graph = new ArtifactGraph([artifact("ST-0001", "Story")]);
    const sessionCalls: string[] = [];
    const scheduler = new Scheduler<string, { agent: string }>({
      graph,
      concurrency: 1,
      isDependencyMet: () => true,
      startStream: (item) => item.id,
      sessionFor: (stream) => {
        sessionCalls.push(stream);
        return { agent: `agent-for-${stream}` };
      },
    });
    scheduler.tick([{ id: "ST-0001", codePaths: [] }]);
    expect(sessionCalls).toEqual(["ST-0001"]);
    expect(scheduler.sessionOf("ST-0001")).toEqual({ agent: "agent-for-ST-0001" });
    expect(scheduler.streamOf("ST-0001")).toBe("ST-0001");
  });
});

describe("codePathsCollide", () => {
  it("returns undefined for disjoint paths", () => {
    expect(codePathsCollide(["src/a.ts"], ["src/b.ts"])).toBeUndefined();
  });

  it("detects an exact match", () => {
    expect(codePathsCollide(["src/a.ts", "src/c.ts"], ["src/b.ts", "src/a.ts"])).toBe("src/a.ts");
  });

  it("detects a glob-prefix overlap", () => {
    expect(codePathsCollide(["src/foo/**"], ["src/foo/bar.ts"])).toBe(
      "src/foo/** ~ src/foo/bar.ts",
    );
  });

  it("does not treat unrelated directories under different globs as colliding", () => {
    expect(codePathsCollide(["src/foo/**"], ["src/bar/**"])).toBeUndefined();
  });
});
