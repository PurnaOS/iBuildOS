import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit } from "../git/run-git.js";
import { FixtureForgeClient, LocalGitRemoteForgeClient, type BranchProtection } from "./client.js";

// No live GitHub API call anywhere in this file: FixtureForgeClient reads
// canned JSON from packages/engine/fixtures/forge/, and
// LocalGitRemoteForgeClient talks only to a throwaway local **bare** git
// repository created with `git init --bare` via runGit.

describe("FixtureForgeClient", () => {
  it("openPullRequest returns exactly the configured pr-open fixture, ignoring call params", async () => {
    const client = new FixtureForgeClient();
    const pr = await client.openPullRequest({
      headBranch: "some/other-branch",
      baseBranch: "develop",
      title: "irrelevant to a fixture double",
    });
    expect(pr).toEqual({
      number: 42,
      url: "https://forge.example/acme/widgets/pull/42",
      headBranch: "stream/st-0102-oauth-refresh",
      baseBranch: "main",
      headSha: "3f1a9c2e7b4d5a6f8e9c0d1b2a3f4e5d6c7b8a9f",
      state: "open",
    });
  });

  it("getCiStatus returns exactly the configured ci-status fixture", async () => {
    const client = new FixtureForgeClient();
    const status = await client.getCiStatus("any-ref-at-all");
    expect(status).toEqual({
      state: "success",
      checks: [
        { name: "ibuildos/gate", state: "success", requiredForMerge: true },
        { name: "lint", state: "success", requiredForMerge: false },
        { name: "unit-tests", state: "success", requiredForMerge: false },
      ],
    });
  });

  it("getBranchProtection defaults to the adequate fixture", async () => {
    const client = new FixtureForgeClient();
    const protection = await client.getBranchProtection("main");
    expect(protection).toEqual({
      enabled: true,
      requiredStatusChecks: { strict: true, contexts: ["ibuildos/gate"] },
      requiredPullRequestReviews: { requiredApprovingReviewCount: 1 },
      enforceAdmins: true,
    });
  });

  it("getBranchProtection returns exactly a non-default configured fixture (disabled)", async () => {
    const client = new FixtureForgeClient({
      files: { branchProtection: "branch-protection-disabled.json" },
    });
    const protection = await client.getBranchProtection("main");
    expect(protection).toEqual({
      enabled: false,
      requiredStatusChecks: null,
      requiredPullRequestReviews: null,
      enforceAdmins: false,
    });
  });

  it("getBranchProtection returns exactly a non-default configured fixture (no gate check)", async () => {
    const client = new FixtureForgeClient({
      files: { branchProtection: "branch-protection-no-gate-check.json" },
    });
    const protection = await client.getBranchProtection("main");
    expect(protection).toEqual({
      enabled: true,
      requiredStatusChecks: { strict: true, contexts: ["lint", "unit-tests"] },
      requiredPullRequestReviews: { requiredApprovingReviewCount: 1 },
      enforceAdmins: true,
    });
  });

  it("getBranchProtection resolves null when configured with no fixture at all", async () => {
    const client = new FixtureForgeClient({ files: { branchProtection: null } });
    expect(await client.getBranchProtection("main")).toBeNull();
  });

  it("setBranchProtection updates what a subsequent getBranchProtection call returns", async () => {
    const client = new FixtureForgeClient({ files: { branchProtection: null } });
    expect(await client.getBranchProtection("main")).toBeNull();

    const next: BranchProtection = {
      enabled: true,
      requiredStatusChecks: { strict: true, contexts: ["ibuildos/gate"] },
      requiredPullRequestReviews: null,
      enforceAdmins: false,
    };
    await client.setBranchProtection("main", next);
    expect(await client.getBranchProtection("main")).toEqual(next);
    // A different branch is unaffected.
    expect(await client.getBranchProtection("other")).toBeNull();
  });
});

describe("LocalGitRemoteForgeClient", () => {
  async function withBareRemote(
    fn: (root: string, bareDir: string, client: LocalGitRemoteForgeClient) => Promise<void>,
  ): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), "ibuildos-forge-remote-"));
    try {
      const bareDir = join(root, "remote.git");
      const client = await LocalGitRemoteForgeClient.create(bareDir);
      await fn(root, bareDir, client);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  async function pushNewBranch(root: string, bareDir: string, branch: string): Promise<string> {
    const workDir = join(root, `work-${branch.replace(/\W+/g, "-")}`);
    await mkdir(workDir, { recursive: true });
    await runGit(["init", "-q", "-b", branch], workDir);
    await runGit(["config", "user.email", "dev@local"], workDir);
    await runGit(["config", "user.name", "Dev"], workDir);
    await runGit(["commit", "--allow-empty", "-q", "-m", `seed ${branch}`], workDir);
    await runGit(["remote", "add", "origin", bareDir], workDir);
    await runGit(["push", "-q", "origin", `${branch}:refs/heads/${branch}`], workDir);
    const rev = await runGit(["rev-parse", "HEAD"], workDir);
    return rev.stdout.trim();
  }

  it("has no branch until one is actually pushed, then can verify it landed", async () => {
    await withBareRemote(async (root, bareDir, client) => {
      expect(await client.branchExists("feature/one")).toBe(false);

      const sha = await pushNewBranch(root, bareDir, "feature/one");
      expect(await client.branchExists("feature/one")).toBe(true);

      // Confirm against real git state directly, not just through the client.
      const rev = await runGit(["rev-parse", "--verify", "refs/heads/feature/one"], bareDir);
      expect(rev.stdout.trim()).toBe(sha);
    });
  });

  it("openPullRequest succeeds once the head branch has landed, reporting the real head sha", async () => {
    await withBareRemote(async (root, bareDir, client) => {
      const sha = await pushNewBranch(root, bareDir, "feature/two");
      const pr = await client.openPullRequest({
        headBranch: "feature/two",
        baseBranch: "main",
        title: "add feature two",
      });
      expect(pr).toMatchObject({
        headBranch: "feature/two",
        baseBranch: "main",
        headSha: sha,
        state: "open",
      });
      expect(pr.number).toBe(1);
    });
  });

  it("openPullRequest rejects a head branch that was never pushed", async () => {
    await withBareRemote(async (_root, _bareDir, client) => {
      await expect(
        client.openPullRequest({ headBranch: "never-pushed", baseBranch: "main", title: "x" }),
      ).rejects.toThrow(/does not exist on the remote/);
    });
  });

  it("assigns increasing PR numbers across multiple opens", async () => {
    await withBareRemote(async (root, bareDir, client) => {
      await pushNewBranch(root, bareDir, "feature/a");
      await pushNewBranch(root, bareDir, "feature/b");
      const first = await client.openPullRequest({
        headBranch: "feature/a",
        baseBranch: "main",
        title: "a",
      });
      const second = await client.openPullRequest({
        headBranch: "feature/b",
        baseBranch: "main",
        title: "b",
      });
      expect(second.number).toBe(first.number + 1);
    });
  });

  it("branch protection round-trips through real git config on the bare repo", async () => {
    await withBareRemote(async (_root, bareDir, client) => {
      expect(await client.getBranchProtection("main")).toBeNull();

      const protection: BranchProtection = {
        enabled: true,
        requiredStatusChecks: { strict: true, contexts: ["ibuildos/gate"] },
        requiredPullRequestReviews: { requiredApprovingReviewCount: 2 },
        enforceAdmins: true,
      };
      await client.setBranchProtection("main", protection);
      expect(await client.getBranchProtection("main")).toEqual(protection);

      // Confirm it's really stored in the bare repo's own git config.
      const raw = await runGit(
        ["config", "--get", "ibuildos.branch-protection.main.enabled"],
        bareDir,
      );
      expect(raw.stdout.trim()).toBe("true");
    });
  });

  it("disabling protection after it was enabled is reflected on read", async () => {
    await withBareRemote(async (_root, _bareDir, client) => {
      await client.setBranchProtection("main", {
        enabled: true,
        requiredStatusChecks: { strict: true, contexts: ["ibuildos/gate"] },
        requiredPullRequestReviews: null,
        enforceAdmins: false,
      });
      await client.setBranchProtection("main", {
        enabled: false,
        requiredStatusChecks: null,
        requiredPullRequestReviews: null,
        enforceAdmins: false,
      });
      expect(await client.getBranchProtection("main")).toEqual({
        enabled: false,
        requiredStatusChecks: null,
        requiredPullRequestReviews: null,
        enforceAdmins: false,
      });
    });
  });

  it("CI status round-trips through real git notes on the bare repo", async () => {
    await withBareRemote(async (root, bareDir, client) => {
      const sha = await pushNewBranch(root, bareDir, "feature/notes");
      expect(await client.getCiStatus("feature/notes")).toEqual({ state: "pending", checks: [] });

      await client.recordCiStatus("feature/notes", {
        state: "success",
        checks: [{ name: "ibuildos/gate", state: "success", requiredForMerge: true }],
      });
      expect(await client.getCiStatus(sha)).toEqual({
        state: "success",
        checks: [{ name: "ibuildos/gate", state: "success", requiredForMerge: true }],
      });

      // Confirm it's really a git note, not in-memory state.
      const notesRaw = await runGit(
        ["notes", "--ref", "refs/notes/ibuildos-ci", "show", sha],
        bareDir,
      );
      expect(JSON.parse(notesRaw.stdout)).toEqual({
        state: "success",
        checks: [{ name: "ibuildos/gate", state: "success", requiredForMerge: true }],
      });
    });
  });
});
