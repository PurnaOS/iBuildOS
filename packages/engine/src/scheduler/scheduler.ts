import type { ArtifactGraph } from "../graph/graph.js";
import { findCycles } from "../graph/queries.js";

// SPEC.md area BD — build orchestration. This module is the scheduler's pure
// decision core: given a dependency graph and a pool of candidate work items,
// decide what can start now (BD-002 parallel-by-default, BD-007
// dependency-aware scheduling + collision avoidance) and track pause/resume
// bookkeeping (BD-009). It is deliberately I/O-free and has zero compile-time
// coupling to the real worktree/merge-queue layer (`packages/engine/src/
// streams/**`, a sibling work package) or the ACP session layer (`packages/
// acp`): both are represented here only as opaque generic type parameters
// the scheduler stores and hands back, never inspects or calls into itself.
// The only side effects this module ever causes are the two caller-injected
// functions below, and only when *this* module decides an item should start.

/**
 * One unit of schedulable work — a story or coherent task set (BD-001) bound
 * to one artifact ID in `graph`. `codePaths` is the caller-supplied `code`
 * glob/path list (FORMATS §4's `code:` field) used for BD-007's
 * collision-avoidance heuristic — the scheduler never reads a `code:` field
 * off disk itself, it only compares whatever list it's given per item.
 */
export interface SchedulableItem {
  readonly id: string;
  readonly codePaths: readonly string[];
}

/** Why a not-yet-started item can't be started right now (PL-004's
 * dependency-view data source). */
export type BlockedReason =
  | {
      readonly kind: "dependency";
      /** The specific unmet dependency in the item's `depends_on` closure
       * (lexicographically smallest, for determinism when several are
       * unmet). */
      readonly blockingId: string;
    }
  | {
      readonly kind: "collision";
      /** The currently-active (running or paused) item this one's
       * `codePaths` overlap. */
      readonly blockingId: string;
      /** The specific path (or path pair) the overlap was found on. */
      readonly path: string;
    };

export type SchedulerReadiness =
  | { readonly id: string; readonly ready: true }
  | { readonly id: string; readonly ready: false; readonly reason: BlockedReason };

/** Raised when the dependency relationship in `graph` contains a cycle —
 * scheduling against it would mean some item can never legitimately become
 * ready, so the scheduler refuses to run at all rather than silently never
 * starting the cyclic items (or worse, starting one anyway). */
export class SchedulerCycleError extends Error {
  constructor(public readonly cycles: readonly (readonly string[])[]) {
    super(
      `dependency graph has a cycle — cannot schedule: ` +
        cycles.map((cycle) => cycle.join(" -> ")).join("; "),
    );
    this.name = "SchedulerCycleError";
  }
}

export interface SchedulerOptions<TStream, TSession = unknown> {
  /** The dependency graph — reused as-is (`ArtifactGraph`/`findCycles`), not
   * reimplemented. `depends_on` edges (ST-005) come from each artifact's own
   * `links:` block, same as every other relationship the graph knows about. */
  graph: ArtifactGraph;
  /** Max number of *running* (non-paused) items at once (BD-002, BD-015). */
  concurrency: number;
  /** Relationship name that encodes `depends_on` edges (default
   * `"depends_on"` per FORMATS §4 / SPEC ST-005) — overridable for tests or
   * an alternate profile field name. */
  dependencyRelationship?: string;
  /**
   * True once the named dependency is merged/complete. Status vocabularies
   * are profile data (CLAUDE.md non-negotiable #4: "self-describing
   * process") — the scheduler never hardcodes a status literal like "done"
   * or "merged" itself; the caller (which knows the merge-queue/artifact
   * state) decides what "complete" means and answers this per dependency ID.
   */
  isDependencyMet: (id: string) => boolean;
  /** Begin work on a ready item (BD-001: worktree + branch + assignment).
   * The scheduler treats the return value as an opaque handle — it never
   * calls anything on it except passing it to `sessionFor`. */
  startStream: (item: SchedulableItem) => TStream;
  /** Optional: bind (or look up) the agent session for a just-started
   * stream. Called at most once per start, immediately after `startStream`.
   * Omit if the caller binds sessions out of band. */
  sessionFor?: (stream: TStream) => TSession;
}

interface ActiveEntry<TStream, TSession> {
  item: SchedulableItem;
  stream: TStream;
  session: TSession | undefined;
  paused: boolean;
}

/**
 * Heuristic BD-007 collision check: do these two code-path lists predict a
 * merge conflict? Exact matches always collide; a static (non-glob) prefix
 * relationship between two entries also collides (`"src/foo/**"` vs.
 * `"src/foo/bar.ts"`), since one is very likely to touch a file the other's
 * glob matches. This is deliberately a cheap heuristic, not a full glob
 * intersection — BD-007 asks the scheduler to "avoid co-scheduling stories
 * it can predict will collide," not to prove non-collision.
 *
 * Returns the first overlapping pair (as `"a ~ b"`, or just `a` when
 * `a === b`) or `undefined` if nothing overlaps.
 */
export function codePathsCollide(
  a: readonly string[],
  b: readonly string[],
): string | undefined {
  for (const pathA of a) {
    const staticA = staticPrefix(pathA);
    for (const pathB of b) {
      if (pathA === pathB) return pathA;
      const staticB = staticPrefix(pathB);
      if (staticA === "" || staticB === "") continue; // too broad to treat as a guaranteed collision
      if (isPathPrefixOf(staticA, pathB) || isPathPrefixOf(staticB, pathA)) {
        return `${pathA} ~ ${pathB}`;
      }
    }
  }
  return undefined;
}

/** The static (non-glob) directory/file prefix of a `code:` glob — the part
 * before the first glob metacharacter. `"src/foo/**"` -> `"src/foo/"`. */
function staticPrefix(pattern: string): string {
  const metaIndex = pattern.search(/[*?[]/);
  return metaIndex === -1 ? pattern : pattern.slice(0, metaIndex);
}

/** Is `prefix` a whole-path-segment prefix of `full`? Either an exact match,
 * or `full` continues right after `prefix` with a `/` — so `"src/foo"`
 * prefixes `"src/foo/bar.ts"` but not `"src/foobar.ts"`. A prefix that
 * already ends in `/` (from stripping a directory glob like `"src/foo/**"`)
 * qualifies on the plain `startsWith` alone, since the boundary is already
 * baked in. */
function isPathPrefixOf(prefix: string, full: string): boolean {
  if (!full.startsWith(prefix)) return false;
  if (full.length === prefix.length) return true;
  return prefix.endsWith("/") || full[prefix.length] === "/";
}

/**
 * Pure dependency-aware, collision-avoiding scheduler (BD-002, BD-007) with
 * pause/resume bookkeeping (BD-009). No filesystem, no process, no network,
 * no real git or agent session — this class only decides *what* to start and
 * invokes the two functions the caller supplied to do it for real.
 */
export class Scheduler<TStream, TSession = unknown> {
  private readonly graph: ArtifactGraph;
  private readonly concurrency: number;
  private readonly dependencyRelationship: string;
  private readonly isDependencyMet: (id: string) => boolean;
  private readonly startStreamFn: (item: SchedulableItem) => TStream;
  private readonly sessionForFn: ((stream: TStream) => TSession) | undefined;
  private readonly active = new Map<string, ActiveEntry<TStream, TSession>>();

  constructor(options: SchedulerOptions<TStream, TSession>) {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
      throw new RangeError(`concurrency must be a positive integer, got ${options.concurrency}`);
    }

    this.graph = options.graph;
    this.concurrency = options.concurrency;
    this.dependencyRelationship = options.dependencyRelationship ?? "depends_on";
    this.isDependencyMet = options.isDependencyMet;
    this.startStreamFn = options.startStream;
    this.sessionForFn = options.sessionFor;

    const cycles = findCycles(this.graph, this.dependencyRelationship);
    if (cycles.length > 0) {
      throw new SchedulerCycleError(cycles);
    }
  }

  /**
   * Every dependency in `id`'s transitive `depends_on` closure, sorted for
   * determinism. Deliberately *not* `queries.reachable`: that helper only
   * follows a hop into nodes present in the graph snapshot, so a dependency
   * that hasn't landed on trunk yet (a `depends_on` target absent from the
   * bundle) would silently drop out of the closure — exactly the "unmerged
   * dependency" case BD-007 exists to catch. This BFS instead records every
   * edge target it sees, present or not, and only recurses through the ones
   * that are present (there's nothing further to walk from one that isn't).
   * The caller's `isDependencyMet` still gets asked about every id — an
   * absent artifact is not deemed complete just because the graph can't see
   * it.
   */
  private dependencyClosure(id: string): string[] {
    const start = id.toUpperCase();
    const closure = new Set<string>();
    const visited = new Set<string>([start]);
    const queue: string[] = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of this.graph.outgoing(current, this.dependencyRelationship)) {
        const target = edge.targetId;
        closure.add(target);
        if (this.graph.has(target) && !visited.has(target)) {
          visited.add(target);
          queue.push(target);
        }
      }
    }

    return [...closure].sort();
  }

  private firstUnmetDependency(id: string): string | undefined {
    for (const dep of this.dependencyClosure(id)) {
      if (!this.isDependencyMet(dep)) return dep;
    }
    return undefined;
  }

  /** Currently-*running* (non-paused) active entries — what counts against
   * the concurrency limit (BD-009 explicitly excludes paused streams from
   * this accounting). */
  private runningEntries(): ActiveEntry<TStream, TSession>[] {
    return [...this.active.values()].filter((entry) => !entry.paused);
  }

  /** Every tracked active entry, running *or* paused — what a candidate's
   * `codePaths` are checked against for collisions. A paused stream keeps
   * its worktree and uncommitted changes (BD-009: "worktree kept"), so its
   * file claim still stands even though it's not using a concurrency slot —
   * pausing frees the slot, not the collision risk. */
  private activeEntries(): ActiveEntry<TStream, TSession>[] {
    return [...this.active.values()];
  }

  private availableSlots(): number {
    return Math.max(0, this.concurrency - this.runningEntries().length);
  }

  private collidesWithActive(
    item: SchedulableItem,
  ): { blockingId: string; path: string } | undefined {
    for (const active of this.activeEntries()) {
      if (active.item.id === item.id) continue;
      const overlap = codePathsCollide(item.codePaths, active.item.codePaths);
      if (overlap) return { blockingId: active.item.id, path: overlap };
    }
    return undefined;
  }

  /**
   * Readiness of one not-yet-started item, with no side effects (PL-004's
   * "what can build now vs. what's blocked and why"): `ready`, or the
   * specific reason — an unmet dependency, or a code-path collision with a
   * currently-active (running or paused) item. Dependency is checked first:
   * collision-avoidance is a scheduling optimization among items that are
   * otherwise ready, not a substitute for the dependency gate.
   */
  readiness(item: SchedulableItem): SchedulerReadiness {
    const unmet = this.firstUnmetDependency(item.id);
    if (unmet !== undefined) {
      return { id: item.id, ready: false, reason: { kind: "dependency", blockingId: unmet } };
    }
    const collision = this.collidesWithActive(item);
    if (collision) {
      return {
        id: item.id,
        ready: false,
        reason: { kind: "collision", blockingId: collision.blockingId, path: collision.path },
      };
    }
    return { id: item.id, ready: true };
  }

  /** `readiness()` over a whole candidate set, in the given order. */
  readinessOf(items: readonly SchedulableItem[]): SchedulerReadiness[] {
    return items.map((item) => this.readiness(item));
  }

  /**
   * One scheduling pass (BD-002/BD-007): walk `items` in the given (priority)
   * order and start every one that's ready right now, respecting the
   * concurrency limit and collision-avoidance. An item started earlier *in
   * this same pass* immediately claims a slot and its code paths, so two
   * colliding items are never both started in one `tick` even though neither
   * was "running" when the pass began. Items already active (running or
   * paused) are skipped without affecting the rest of the pass. A blocked
   * item never blocks lower-priority items behind it from starting.
   *
   * Returns the stream handles started this pass, in start order.
   */
  tick(items: readonly SchedulableItem[]): TStream[] {
    const started: TStream[] = [];

    for (const item of items) {
      if (this.active.has(item.id)) continue;
      if (this.availableSlots() <= 0) break; // no capacity left this pass, for anyone

      const unmet = this.firstUnmetDependency(item.id);
      if (unmet !== undefined) continue;

      const collision = this.collidesWithActive(item);
      if (collision) continue;

      const stream = this.startStreamFn(item);
      const session = this.sessionForFn?.(stream);
      this.active.set(item.id, { item, stream, session, paused: false });
      started.push(stream);
    }

    return started;
  }

  /** Is this item currently tracked as active (running or paused)? */
  isActive(id: string): boolean {
    return this.active.has(id);
  }

  /** Is this active item currently paused? `false` for both a running item
   * and one not tracked at all. */
  isPaused(id: string): boolean {
    return this.active.get(id)?.paused ?? false;
  }

  /** The stream handle `startStream` returned for this active item, if any. */
  streamOf(id: string): TStream | undefined {
    return this.active.get(id)?.stream;
  }

  /** The session `sessionFor` returned for this active item, if any. */
  sessionOf(id: string): TSession | undefined {
    return this.active.get(id)?.session;
  }

  /** Every currently-active item id (running or paused), sorted. */
  activeIds(): string[] {
    return [...this.active.keys()].sort();
  }

  /**
   * Pause a running stream (BD-009): stays tracked as active (still visible
   * to `isActive`/`streamOf`, and its `codePaths` still collide new
   * candidates — its worktree keeps its uncommitted changes per BD-009) but
   * is excluded from the *running* count a concurrency slot represents,
   * freeing that slot for other work. No I/O here — the caller is
   * responsible for the real `session/cancel` and worktree bookkeeping; this
   * only updates the scheduler's own view of capacity.
   */
  pause(id: string): void {
    const entry = this.active.get(id);
    if (!entry) throw new Error(`cannot pause "${id}": not an active stream`);
    entry.paused = true;
  }

  /**
   * Resume a paused stream: it counts against the concurrency limit again
   * immediately (its code-path claim was never released by `pause`). No new
   * `startStream` call — the worktree/session are still there per BD-009,
   * this only restores scheduler bookkeeping (the caller re-establishes or
   * resumes the real session on its own).
   */
  resume(id: string): void {
    const entry = this.active.get(id);
    if (!entry) throw new Error(`cannot resume "${id}": not an active stream`);
    entry.paused = false;
  }

  /**
   * Stop tracking a finished/aborted/superseded stream, freeing its slot and
   * code-path claim. The scheduler doesn't track *why* — done vs. failed vs.
   * aborted is state the caller (run records, BD-011) owns; this is purely
   * "stop counting this against capacity." A no-op if `id` isn't active.
   *
   * Released does not mean "never again": an id handed back to `tick` after
   * being released is just a fresh candidate like any other — it is the
   * caller's job to drop ids it considers finished from the candidate list
   * it passes to `tick`/`readinessOf`, not the scheduler's.
   */
  release(id: string): void {
    this.active.delete(id);
  }
}
