import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

// AC-007 — scope every fs/terminal path to the session's worktree; paths
// outside scope are refused. Symlink-escape-safe: resolves through the
// nearest *existing* ancestor's real path (defeating a symlinked
// intermediate directory) before checking containment, so both "read a
// symlink pointing outside the worktree" and "write through a directory
// symlink that points outside" are caught — not just literal `..` segments.

export class ScopeError extends Error {}

/** Resolves `requestedPath` against `root`, throwing `ScopeError` if the
 * real, symlink-resolved location falls outside `root`. `requestedPath`
 * need not exist yet (the write case) — its nearest existing ancestor is
 * realpath'd and the non-existent tail is reappended. */
export function resolveScoped(root: string, requestedPath: string): string {
  if (!isAbsolute(requestedPath)) {
    throw new ScopeError(`path must be absolute (ACP paths are always absolute): ${requestedPath}`);
  }

  const realRoot = realpathSync(root);

  let existing = requestedPath;
  const tailParts: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break; // reached filesystem root without finding anything real
    tailParts.unshift(existing.slice(parent.length + 1));
    existing = parent;
  }
  const realExisting = realpathSync(existing);
  const realTarget = tailParts.length > 0 ? join(realExisting, ...tailParts) : realExisting;

  const rel = relative(realRoot, realTarget);
  const isWithin = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (!isWithin) {
    throw new ScopeError(`path escapes worktree scope: ${requestedPath} (resolved: ${realTarget}, root: ${realRoot})`);
  }
  return realTarget;
}
