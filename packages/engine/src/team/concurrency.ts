import { runGit } from "../git/run-git.js";

// SPEC TM-006 — human concurrency via git. Concurrent human edits reconcile
// through ordinary branch/PR/merge flow; this module only surfaces
// "someone else has in-flight changes to X" (fetch-visible paths that
// differ between HEAD and a compare ref) as advisory awareness. Never a
// hard lock, never a throw: any git failure (no remote, offline, unknown
// ref, unrelated histories) degrades to an empty, honest advisory rather
// than blocking the caller — TM-006 is explicit that this is "never hard
// locks."

export interface ConcurrencyAdvisoryOptions {
  /**
   * Ref to diff HEAD against — typically a remote-tracking branch. Defaults
   * to the current branch's upstream (`@{u}`), the natural "what's on the
   * shared remote that I don't have yet" comparison. Callers without a
   * configured remote (e.g. tests against a bare local repo) should pass an
   * explicit ref, such as another local branch name.
   */
  compareRef?: string;
  /**
   * Skip the `git fetch` step (e.g. the caller already fetched, or is
   * intentionally offline). Default: fetch first, so the comparison
   * reflects up-to-date fetch-visible state (TM-005/TM-006).
   */
  skipFetch?: boolean;
}

export interface ConcurrencyAdvisory {
  /** Whether `git fetch` completed successfully. `false` doesn't fail the
   * call — it just means the advisory reflects whatever was already
   * fetched locally. Never a hard block. */
  fetched: boolean;
  /** The ref actually compared against. */
  compareRef: string;
  /** Repo-relative paths that differ between HEAD and the merge-base with
   * `compareRef` — changes present on the other side that HEAD doesn't
   * have. Sorted, deduped. Empty when the ref is missing, shares no common
   * history, or nothing differs — never throws. */
  paths: string[];
  /** One human-readable advisory line per path, e.g. "someone else has
   * in-flight changes to docs/stories/st-0042.md". Purely informational. */
  messages: string[];
}

/**
 * Compute a concurrency advisory for the git repo at `projectDir` (TM-006):
 * what changed on `compareRef` that HEAD doesn't have. Uses a three-dot
 * diff (`HEAD...compareRef`, i.e. against the merge-base) so the caller's
 * own uncommitted-relative-to-trunk work is never mistaken for "someone
 * else's" change. No locking of any kind — advisory only, and never throws;
 * any git failure yields an empty advisory instead.
 */
export async function concurrencyAdvisory(
  projectDir: string,
  options: ConcurrencyAdvisoryOptions = {},
): Promise<ConcurrencyAdvisory> {
  const compareRef = options.compareRef ?? "@{u}";

  let fetched = false;
  if (!options.skipFetch) {
    const fetchResult = await runGit(["fetch"], projectDir, { check: false });
    fetched = fetchResult.exitCode === 0;
  }

  const diffResult = await runGit(
    ["diff", "--name-only", `HEAD...${compareRef}`],
    projectDir,
    { check: false },
  );

  if (diffResult.exitCode !== 0) {
    return { fetched, compareRef, paths: [], messages: [] };
  }

  const paths = [
    ...new Set(
      diffResult.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  ].sort();

  const messages = paths.map((path) => `someone else has in-flight changes to ${path}`);

  return { fetched, compareRef, paths, messages };
}
