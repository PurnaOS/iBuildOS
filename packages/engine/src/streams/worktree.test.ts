import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit } from "../git/run-git.js";
import {
  addWorktree,
  clearClaim,
  ClaimFieldMissingError,
  integrationBranchName,
  mintNonce,
  readClaim,
  removeWorktree,
  streamBranchName,
  writeClaim,
} from "./worktree.js";

// A worktree created by a test lives as a sibling of `repoPath` *inside*
// this same per-test root, so the one `finally` below cleans up the repo
// *and* any worktree even if a test fails midway through (before reaching
// its own worktree cleanup call).
async function withTempRepo(fn: (repoPath: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ibuildos-worktree-"));
  const repoPath = join(root, "repo");
  await mkdir(repoPath, { recursive: true });
  try {
    await runGit(["init", "-q", "-b", "main"], repoPath);
    await runGit(["config", "user.email", "test@example.com"], repoPath);
    await runGit(["config", "user.name", "Test"], repoPath);
    await fn(repoPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const STORY_WITH_CLAIM = `---
type: Story
id: ST-0042
title: "Offline inspection capture"
state: building
owner: US-0001
provenance: agent
created: 2026-08-14
claim: { by: "", machine: "", at: "1970-01-01T00:00:00Z" }
---

Body text.
`;

const STORY_WITHOUT_CLAIM = `---
type: Story
id: ST-0043
title: "No claim block yet"
state: draft
owner: US-0001
provenance: human
created: 2026-08-14
---

Body text.
`;

describe("mintNonce", () => {
  it("produces a 4-char base36 string", () => {
    for (let i = 0; i < 20; i++) {
      expect(mintNonce()).toMatch(/^[0-9a-z]{4}$/);
    }
  });

  it("is not the same value every call (probabilistic, but 4-char base36 has ~1.6M values)", () => {
    const nonces = new Set(Array.from({ length: 30 }, () => mintNonce()));
    expect(nonces.size).toBeGreaterThan(1);
  });
});

describe("branch naming (FORMATS §11)", () => {
  it("streamBranchName lowercases the work id", () => {
    expect(streamBranchName("ST-0042", "a3f9")).toBe("ibos/st-0042-a3f9");
  });

  it("integrationBranchName", () => {
    expect(integrationBranchName(3)).toBe("ibos/merge-3");
  });
});

describe("addWorktree / removeWorktree", () => {
  it("creates a worktree on a new branch, then removes it", async () => {
    await withTempRepo(async (repoPath) => {
      await runGit(["commit", "--allow-empty", "-m", "init"], repoPath);

      const worktreePath = join(repoPath, "..", "wt-a3f9");
      const branch = streamBranchName("ST-0042", "a3f9");
      await addWorktree({ repoPath, worktreePath, branch });

      const list = await runGit(["worktree", "list", "--porcelain"], repoPath);
      expect(list.stdout).toContain(worktreePath);

      const branchList = await runGit(["branch", "--list", branch], repoPath);
      expect(branchList.stdout).toContain(branch);

      await removeWorktree({ repoPath, worktreePath });
      const listAfter = await runGit(["worktree", "list", "--porcelain"], repoPath);
      expect(listAfter.stdout).not.toContain(worktreePath);

      await rm(worktreePath, { recursive: true, force: true });
    });
  });
});

describe("BD-017 claim read/write/clear", () => {
  it("readClaim returns null when the artifact can't be found", async () => {
    await withTempRepo(async (dir) => {
      const claim = await readClaim(dir, "ST-0042", () => null);
      expect(claim).toBeNull();
    });
  });

  it("readClaim returns null for a blank/invalid claim block", async () => {
    await withTempRepo(async (dir) => {
      await writeFile(join(dir, "st-0042.md"), STORY_WITH_CLAIM, "utf8");
      const claim = await readClaim(dir, "ST-0042", () => "st-0042.md");
      expect(claim).toBeNull();
    });
  });

  it("writeClaim then readClaim round-trips, touching only the three claim lines", async () => {
    await withTempRepo(async (dir) => {
      const path = join(dir, "st-0042.md");
      await writeFile(path, STORY_WITH_CLAIM, "utf8");

      await writeClaim(
        dir,
        "ST-0042",
        { by: "US-0001", machine: "srinis-mbp", at: "2026-08-14T09:15:02Z" },
        () => "st-0042.md",
      );

      const claim = await readClaim(dir, "ST-0042", () => "st-0042.md");
      expect(claim).toEqual({ by: "US-0001", machine: "srinis-mbp", at: "2026-08-14T09:15:02Z" });

      const raw = await readFile(path, "utf8");
      expect(raw).toContain('claim: { by: "US-0001", machine: "srinis-mbp", at: "2026-08-14T09:15:02Z" }');
      // Everything outside the claim line is untouched.
      const beforeLines = STORY_WITH_CLAIM.split("\n");
      const afterLines = raw.split("\n");
      expect(afterLines).toHaveLength(beforeLines.length);
      const changedLines = beforeLines.filter((line, i) => line !== afterLines[i]);
      expect(changedLines).toEqual([
        'claim: { by: "", machine: "", at: "1970-01-01T00:00:00Z" }',
      ]);
    });
  });

  it("clearClaim blanks the claim so readClaim reports no active claim", async () => {
    await withTempRepo(async (dir) => {
      const path = join(dir, "st-0042.md");
      await writeFile(path, STORY_WITH_CLAIM, "utf8");
      await writeClaim(
        dir,
        "ST-0042",
        { by: "US-0001", machine: "srinis-mbp", at: "2026-08-14T09:15:02Z" },
        () => "st-0042.md",
      );
      expect(await readClaim(dir, "ST-0042", () => "st-0042.md")).not.toBeNull();

      await clearClaim(dir, "ST-0042", () => "st-0042.md");
      expect(await readClaim(dir, "ST-0042", () => "st-0042.md")).toBeNull();
    });
  });

  it("writeClaim throws ClaimFieldMissingError when the artifact has no claim block at all", async () => {
    await withTempRepo(async (dir) => {
      await writeFile(join(dir, "st-0043.md"), STORY_WITHOUT_CLAIM, "utf8");
      await expect(
        writeClaim(dir, "ST-0043", { by: "US-0001", machine: "m", at: "2026-08-14T09:15:02Z" }, () => "st-0043.md"),
      ).rejects.toBeInstanceOf(ClaimFieldMissingError);
    });
  });
});
