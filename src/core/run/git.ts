// Git helpers for the run loop's local audit ledger. Argv arrays only, never
// shell strings. There is deliberately NO push function here (or anywhere in the
// engine): `iBuild run` commits locally per task and the human reviews before
// anything leaves the machine.
import { execFileSync } from "node:child_process";

function git(dir: string, args: string[]): string {
  return execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
}

export function isRepo(dir: string): boolean {
  try {
    git(dir, ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

// head returns the current commit hash, "" before the first commit.
export function head(dir: string): string {
  try {
    return git(dir, ["rev-parse", "HEAD"]).trim();
  } catch {
    return "";
  }
}

export function isClean(dir: string): boolean {
  return git(dir, ["status", "--porcelain"]).trim() === "";
}

// commitAll stages everything and commits — one task, one ledger entry.
export function commitAll(dir: string, message: string): void {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", message]);
}

// revertAll discards the working tree back to HEAD, including untracked files —
// whole worktree, matching commitAll/isClean scope even when the bundle is a
// subdirectory of the repo. Callers must only use this under the clean-tree
// precondition (re-checked before every claim), so everything removed is
// attempt-produced.
export function revertAll(dir: string): void {
  const top = git(dir, ["rev-parse", "--show-toplevel"]).trim();
  git(top, ["checkout", "--", "."]);
  git(top, ["clean", "-fd"]);
}
