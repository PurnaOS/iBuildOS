import watcher from "@parcel/watcher";
import type { AsyncSubscription } from "@parcel/watcher";
import { extname } from "node:path";

// Incremental watcher (T-007 VG-002: "file-watch (@parcel/watcher) ->
// dirty-set revalidation in milliseconds"). This module's own job is
// narrow: detect raw file add/change/delete events under a directory tree,
// debounce them, and hand the raw changed-path list to a caller-supplied
// resolver that knows how to walk the artifact link graph (this package
// doesn't own a graph module yet — that's a parallel work package). The
// dirty set reported to `onDirtySet` is always the raw changed paths plus
// whatever the resolver adds for them.
//
// @parcel/watcher reports events for *directories* too (confirmed
// empirically: `mkdir -p a/b && touch a/b/c.md` yields three events — `a`,
// `a/b`, and `a/b/c.md` — plus, separately, a spurious create event for a
// just-created watch root, since its native look-back window can pick up
// the root's own creation). Directories are never artifacts, so raw events
// are filtered down to file extensions the caller cares about before
// anything reaches `onDirtySet` or the resolver. This also keeps a
// real-repo watch from thrashing on `.git/**` churn during ordinary git
// operations.

export interface WatchBundleOptions {
  /** Quiet period, in milliseconds, after the last raw file-system event
   * before `onDirtySet` fires. Repeated events within the window reset the
   * timer rather than each producing their own callback. Defaults to 100ms. */
  debounceMs?: number;
  /**
   * Caller-supplied resolver mapping the raw changed paths (from this
   * debounce window) to additional artifact paths that reverse-link to
   * them — e.g. a Requirement whose linked Task just changed. Backed by
   * whatever graph the caller has; this watcher holds no graph of its own.
   * When omitted, the dirty set reported is exactly the raw changed paths.
   * Must not throw: an exception here is caught and logged (never crashes
   * the watch), and the window still reports its raw paths.
   */
  resolveDirtyNeighbors?: (changedPaths: string[]) => string[];
  /** File extensions (with leading dot, e.g. ".md") treated as artifact
   * files; all other paths — directories, `.git/**`, editor swap files,
   * etc. — are dropped from every dirty set. Defaults to `[".md"]`. */
  extensions?: string[];
}

export interface BundleWatch {
  /** Stops watching and releases the underlying native watch handle. Safe
   * to call once; no further `onDirtySet` calls occur once this resolves. */
  close(): Promise<void>;
}

/**
 * Watches `rootDir` (recursively) for artifact file add/change/delete
 * events. After each debounce window of quiet, calls `onDirtySet` with the
 * deduplicated, sorted union of the window's raw changed paths and
 * whatever `opts.resolveDirtyNeighbors` returns for them.
 */
export async function watchBundle(
  rootDir: string,
  onDirtySet: (artifactPaths: string[]) => void,
  opts: WatchBundleOptions = {},
): Promise<BundleWatch> {
  const debounceMs = opts.debounceMs ?? 100;
  const resolveDirtyNeighbors = opts.resolveDirtyNeighbors;
  const extensions = new Set(opts.extensions ?? [".md"]);

  let pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function flush(): void {
    timer = null;
    if (closed || pending.size === 0) return;
    const changed = [...pending].sort();
    pending = new Set();

    const dirty = new Set<string>(changed);
    if (resolveDirtyNeighbors) {
      try {
        for (const neighbor of resolveDirtyNeighbors(changed)) dirty.add(neighbor);
      } catch (error) {
        // A broken resolver must not take the watch down (it runs off a
        // bare setTimeout — an uncaught throw here would otherwise be an
        // uncaught exception in whatever process hosts this watcher).
        console.error("watchBundle: resolveDirtyNeighbors threw", error);
      }
    }

    try {
      onDirtySet([...dirty].sort());
    } catch (error) {
      console.error("watchBundle: onDirtySet threw", error);
    }
  }

  const subscription: AsyncSubscription = await watcher.subscribe(rootDir, (err, events) => {
    if (closed || err) return;
    for (const event of events) {
      if (!extensions.has(extname(event.path))) continue;
      pending.add(event.path);
    }
    if (pending.size === 0) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  });

  return {
    async close() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending = new Set();
      await subscription.unsubscribe();
    },
  };
}
