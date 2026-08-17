import { execFile } from "node:child_process";

// System git CLI, argv arrays only — never a shell string (T-006). Every
// worktree/merge/branch operation in the streams substrate shells out
// through this one function so the app and a user's own `git` in a terminal
// behave identically.

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitError extends Error {
  constructor(
    public readonly args: string[],
    public readonly result: GitResult,
  ) {
    super(`git ${args.join(" ")} exited ${result.exitCode}: ${result.stderr.trim()}`);
  }
}

export interface RunGitOptions {
  /** Reject on non-zero exit (default true). Set false to inspect exitCode yourself. */
  check?: boolean;
  env?: Record<string, string | undefined>;
}

export function runGit(args: string[], cwd: string, opts: RunGitOptions = {}): Promise<GitResult> {
  const check = opts.check ?? true;
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, env: opts.env ?? process.env, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const exitCode = error ? (typeof error.code === "number" ? error.code : -1) : 0;
        const result: GitResult = { stdout, stderr, exitCode };
        if (check && error) {
          reject(new GitError(args, result));
        } else {
          resolve(result);
        }
      },
    );
  });
}
