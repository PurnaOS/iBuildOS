import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitError, runGit } from "./run-git.js";

async function withTempRepo(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "ibuildos-rungit-"));
  try {
    await runGit(["init", "-q"], dir);
    await runGit(["config", "user.email", "test@example.com"], dir);
    await runGit(["config", "user.name", "Test"], dir);
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("runGit", () => {
  it("runs a real git command and captures stdout", async () => {
    await withTempRepo(async (dir) => {
      const result = await runGit(["status", "--short"], dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });
  });

  it("rejects on a failing command by default", async () => {
    await withTempRepo(async (dir) => {
      await expect(runGit(["not-a-real-command"], dir)).rejects.toBeInstanceOf(GitError);
    });
  });

  it("resolves with a non-zero exit code when check: false", async () => {
    await withTempRepo(async (dir) => {
      const result = await runGit(["not-a-real-command"], dir, { check: false });
      expect(result.exitCode).not.toBe(0);
    });
  });

  it("never invokes a shell — an argument with shell metacharacters is passed literally", async () => {
    await withTempRepo(async (dir) => {
      const result = await runGit(["commit", "--allow-empty", "-m", "a; rm -rf /"], dir);
      expect(result.exitCode).toBe(0);
      const log = await runGit(["log", "-1", "--format=%s"], dir);
      expect(log.stdout.trim()).toBe("a; rm -rf /");
    });
  });
});
