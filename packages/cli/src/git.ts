import { execFile } from "node:child_process";

// packages/engine deliberately carries no git integration (it stays pure/
// in-memory — AGENTS.md, Wave 1's design), so the CLI shells out to the
// system git directly for the two things FORMATS §12 needs: the evaluated
// commit sha, and the changed-file list for `validate --changed`/`--base`.
// Argv arrays only, never a shell string (TECH-STACK T-006).

function runGit(args: string[], cwd: string): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolvePromise) => {
    execFile("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      const exitCode = error ? (typeof error.code === "number" ? error.code : -1) : 0;
      resolvePromise({ stdout, exitCode });
    });
  });
}

/** The current commit sha for `cwd`, for the findings report's `commit`
 * field (FORMATS §12). Falls back to `"unknown"` when `cwd` isn't inside a
 * git repository (a bare fixture directory in tests, an extracted tarball,
 * …) — the findings report schema requires a string here, and a fixed
 * sentinel is clearer than an empty string or throwing. */
export async function currentCommitSha(cwd: string): Promise<string> {
  const result = await runGit(["rev-parse", "HEAD"], cwd);
  if (result.exitCode !== 0) return "unknown";
  return result.stdout.trim() || "unknown";
}

/** Filenames changed relative to `ref` (or the working tree against HEAD
 * when `ref` is undefined — `--changed`), repo-relative paths as git reports
 * them. Used to scope `validate --changed`/`--base <ref>`. Falls back to an
 * empty list (meaning "nothing in scope") when git isn't available rather
 * than throwing — scoped validation degrading to "validate nothing" is
 * safer than crashing the whole command. */
export async function changedFiles(cwd: string, ref?: string): Promise<string[]> {
  const args = ref ? ["diff", "--name-only", `${ref}...HEAD`] : ["diff", "--name-only", "HEAD"];
  const diffResult = await runGit(args, cwd);
  if (diffResult.exitCode !== 0) return [];
  const diffed = diffResult.stdout.split("\n").map((line) => line.trim()).filter(Boolean);

  // `--changed` (no explicit base) also covers untracked new files, which
  // `git diff` never reports.
  if (!ref) {
    const untrackedResult = await runGit(["ls-files", "--others", "--exclude-standard"], cwd);
    const untracked =
      untrackedResult.exitCode === 0
        ? untrackedResult.stdout.split("\n").map((line) => line.trim()).filter(Boolean)
        : [];
    return [...new Set([...diffed, ...untracked])].sort();
  }

  return [...new Set(diffed)].sort();
}
