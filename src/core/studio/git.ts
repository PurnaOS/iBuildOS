// Small git helpers for the Studio (review + simulate). Read-only except
// `checkout` (the only mutation the server makes — discard) and worktree
// add/remove (throwaway detached trees outside the repo). All build argv arrays,
// never shell strings.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function git(dir: string, args: string[]): string {
  // stderr piped (captured, not printed) so best-effort calls in non-git dirs stay quiet.
  return execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
}

export function toplevel(dir: string): string {
  return git(dir, ["rev-parse", "--show-toplevel"]).trim();
}

// prefix is the bundle's path within the repo ("" when the bundle is the root).
export function prefix(dir: string): string {
  return git(dir, ["rev-parse", "--show-prefix"]).trim().replace(/\/$/, "");
}

// diff returns the working-tree unified diff, scoped to the bundle subtree.
export function diff(dir: string): string {
  const pfx = safePrefix(dir);
  return pfx ? git(dir, ["diff", "--", pfx]) : git(dir, ["diff"]);
}

// checkout reverts the named bundle-relative paths (the ONLY git mutation).
export function checkout(dir: string, paths: string[]): void {
  if (paths.length === 0) return;
  git(dir, ["checkout", "--", ...paths]);
}

// changedFiles lists bundle-subtree paths with working-tree changes (porcelain).
export function changedFiles(dir: string): string[] {
  const pfx = safePrefix(dir);
  const args = ["status", "--porcelain"];
  if (pfx) args.push("--", pfx);
  const out = git(dir, args);
  const files: string[] = [];
  for (const line of out.split("\n")) {
    if (line.trim() === "") continue;
    const path = line.slice(3); // "XY path"
    const real = path.includes(" -> ") ? path.split(" -> ")[1]! : path;
    files.push(real);
  }
  return files.sort();
}

export interface Worktree {
  dir: string;
  cleanup: () => void;
}

// addWorktree creates a detached worktree at ref in a temp dir OUTSIDE the repo.
export function addWorktree(repoTop: string, ref: string): Worktree {
  const dir = mkdtempSync(join(tmpdir(), "ibuild-wt-"));
  git(repoTop, ["worktree", "add", "--detach", dir, ref]);
  return {
    dir,
    cleanup: () => {
      try {
        git(repoTop, ["worktree", "remove", "--force", dir]);
      } catch {
        /* best effort */
      }
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

// worktreeList parses `git worktree list --porcelain` into {path, head, branch}.
export function worktreeList(dir: string): Array<{ path: string; head: string; branch: string }> {
  let out: string;
  try {
    out = git(dir, ["worktree", "list", "--porcelain"]);
  } catch {
    return [];
  }
  const trees: Array<{ path: string; head: string; branch: string }> = [];
  let cur: { path: string; head: string; branch: string } | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur) trees.push(cur);
      cur = { path: line.slice("worktree ".length), head: "", branch: "" };
    } else if (cur && line.startsWith("HEAD ")) cur.head = line.slice("HEAD ".length).slice(0, 12);
    else if (cur && line.startsWith("branch ")) cur.branch = line.slice("branch ".length).replace("refs/heads/", "");
    else if (cur && line.trim() === "detached") cur.branch = "(detached)";
  }
  if (cur) trees.push(cur);
  return trees;
}

function safePrefix(dir: string): string {
  try {
    return prefix(dir);
  } catch {
    return "";
  }
}
