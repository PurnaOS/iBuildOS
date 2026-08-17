import type { Finding } from "@ibuildos/schemas";
import { matchGlob } from "../rules/chain.js";

// SPEC.md BF-005 (partial adoption): adoption is scopeable to paths/areas of the repo,
// expanding over time; "the gate enforces strictly inside adopted scope and stays silent
// outside." This module is the standalone path-scope filter that decision needs — a pure
// partition function, not a new gate engine. It deliberately does not touch
// `gates/evaluate.ts`: that module's `ExpandedRule.scope` (the `?scope=` modifier parsed off
// a gate entry, e.g. `merge?scope=release`) is today informational only per its own `// TODO`
// — real "filter `artifacts`/findings by scope" wiring is later work. What this module
// provides is the piece that later wiring needs: given declared in-scope path globs and a
// batch of findings (or anything else path-addressable), split them into in-scope (subject to
// strict enforcement) vs out-of-scope (lenient/off) sets. A caller building a scoped gate
// evaluation would run `evaluateGate` as today, then partition its output with this module,
// treating `inScope` findings as blocking and `outOfScope` findings as informational/ignored —
// or pre-filter `artifacts` before calling `evaluateGate`, per that module's own guidance.
//
// Reuses `matchGlob` from `rules/chain.ts` (already exported from the package's public
// surface via `index.ts` -> `rules/index.ts`) rather than pulling in a glob dependency or
// re-implementing chain.ts's minimal matcher — same glob subset (`*`, `**`, `?`) FORMATS.md's
// baseline `scope_events.added_paths` examples use (e.g. `"src/legacy/**"`).

/** Does `path` match at least one of `scopeGlobs`? Multiple matching globs still yield a
 * single true — this is a membership test, not a count. */
export function isPathInScope(path: string, scopeGlobs: readonly string[]): boolean {
  return scopeGlobs.some((glob) => matchGlob(glob, path));
}

export interface ScopePartition<T> {
  /** Items whose path matched at least one declared scope glob — strict enforcement. */
  inScope: T[];
  /** Items whose path matched none of the declared scope globs — lenient/off. */
  outOfScope: T[];
}

/** Extracts the repo-relative path an item concerns, for scope matching. */
export type PathOf<T> = (item: T) => string;

/**
 * Partition an arbitrary list of path-addressable items into in-scope vs out-of-scope,
 * given a set of declared in-scope path globs (BF-005's "adoption shall be scopeable to
 * paths/areas of the repo"). Pure and order-preserving within each output bucket — no
 * sorting, no dedup, no gate evaluation; callers that need those apply them separately.
 *
 * An item matching zero declared globs lands in `outOfScope`; an item matching two or more
 * globs still lands in `inScope` exactly once (this is a partition, not a per-glob fan-out).
 * An empty `scopeGlobs` list means nothing is in scope — everything is out of scope, which
 * matches "adoption is scopeable" reading as opt-in, not opt-out.
 */
export function partitionByScope<T>(
  items: readonly T[],
  scopeGlobs: readonly string[],
  pathOf: PathOf<T>,
): ScopePartition<T> {
  const inScope: T[] = [];
  const outOfScope: T[] = [];
  for (const item of items) {
    (isPathInScope(pathOf(item), scopeGlobs) ? inScope : outOfScope).push(item);
  }
  return { inScope, outOfScope };
}

// `Finding.artifact` is documented in `rules/chain.ts` (checkCodeUnlinked) as "a free string,
// not required to be an ID" — for filesystem-scoped findings (chain/code-unlinked,
// chain/task-no-code's glob subjects) it already *is* a repo-relative path. For
// artifact-ID-scoped findings (an OKF document's own field/link/state rules), there is no
// path on the Finding itself — resolving an artifact ID to its bundle path is an OKF-store
// concern this package-internal module doesn't have access to here, so callers with a real
// resolver should pass their own `pathOf` to `partitionByScope` instead of using this
// convenience, which defaults to treating `artifact` as the path.
export function partitionFindingsByScope(
  findings: readonly Finding[],
  scopeGlobs: readonly string[],
  pathOf: PathOf<Finding> = (finding) => finding.artifact,
): ScopePartition<Finding> {
  return partitionByScope(findings, scopeGlobs, pathOf);
}
