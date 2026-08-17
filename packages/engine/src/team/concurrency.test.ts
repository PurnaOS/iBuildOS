import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runGit } from "../git/run-git.js";
import { concurrencyAdvisory } from "./concurrency.js";

// Real local git repo, two branches — no bare/remote repo needed since
// concurrencyAdvisory's `compareRef` accepts any ref, including a plain
// local branch name (that's the whole point of making it configurable).

async function initRepo(dir: string): Promise<void> {
  await runGit(["init"], dir);
  await runGit(["checkout", "-b", "main"], dir);
  await runGit(["config", "user.email", "test@example.com"], dir);
  await runGit(["config", "user.name", "Test User"], dir);
  await runGit(["config", "commit.gpgsign", "false"], dir);
}

async function commitFile(dir: string, relPath: string, contents: string, message: string): Promise<void> {
  const fullPath = join(dir, relPath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents, "utf8");
  await runGit(["add", "-A"], dir);
  await runGit(["commit", "-m", message], dir);
}

describe("concurrencyAdvisory", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ibuildos-concurrency-"));
    await initRepo(dir);
    await commitFile(dir, "README.md", "root\n", "initial commit");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports paths changed on the compare branch that HEAD doesn't have", async () => {
    await runGit(["checkout", "-b", "other"], dir);
    await commitFile(dir, "docs/stories/st-0042.md", "in flight\n", "other branch work");
    await runGit(["checkout", "main"], dir);

    const advisory = await concurrencyAdvisory(dir, { compareRef: "other", skipFetch: true });

    expect(advisory.paths).toEqual(["docs/stories/st-0042.md"]);
    expect(advisory.messages).toEqual([
      "someone else has in-flight changes to docs/stories/st-0042.md",
    ]);
  });

  it("uses a three-dot (merge-base) diff — HEAD's own divergent commits never appear as 'someone else's'", async () => {
    await runGit(["checkout", "-b", "other"], dir);
    await commitFile(dir, "docs/stories/st-0042.md", "in flight\n", "other branch work");
    await runGit(["checkout", "main"], dir);
    await commitFile(dir, "docs/stories/st-0099.md", "my own work\n", "main's own commit");

    const advisory = await concurrencyAdvisory(dir, { compareRef: "other", skipFetch: true });

    expect(advisory.paths).toEqual(["docs/stories/st-0042.md"]);
    expect(advisory.paths).not.toContain("docs/stories/st-0099.md");
  });

  it("degrades gracefully when git fetch fails (bad remote), but still computes the diff", async () => {
    // A remote pointing at a nonexistent local path fails fast and
    // deterministically (no network timeout) — unlike a repo with *no*
    // remote at all, which some git versions treat as a silent no-op
    // success rather than an error.
    await runGit(["remote", "add", "origin", join(dir, "does-not-exist")], dir);
    await runGit(["checkout", "-b", "other"], dir);
    await commitFile(dir, "docs/stories/st-0042.md", "in flight\n", "other branch work");
    await runGit(["checkout", "main"], dir);

    // skipFetch left at its default (false): fetch is attempted, fails,
    // and the call must not throw or hard-block per TM-006.
    const advisory = await concurrencyAdvisory(dir, { compareRef: "other" });

    expect(advisory.fetched).toBe(false);
    expect(advisory.paths).toEqual(["docs/stories/st-0042.md"]);
  });

  it("reports fetched: true after a successful fetch from a real local remote", async () => {
    const remoteDir = await mkdtemp(join(tmpdir(), "ibuildos-concurrency-remote-"));
    try {
      await runGit(["init", "--bare", "-q"], remoteDir);
      await runGit(["remote", "add", "origin", remoteDir], dir);
      await runGit(["push", "-q", "origin", "main"], dir);

      const advisory = await concurrencyAdvisory(dir, { compareRef: "origin/main" });

      expect(advisory.fetched).toBe(true);
      expect(advisory.paths).toEqual([]);
    } finally {
      await rm(remoteDir, { recursive: true, force: true });
    }
  });

  it("returns an empty, honest advisory for a nonexistent compare ref, without throwing", async () => {
    const advisory = await concurrencyAdvisory(dir, {
      compareRef: "does-not-exist",
      skipFetch: true,
    });

    expect(advisory).toEqual({
      fetched: false,
      compareRef: "does-not-exist",
      paths: [],
      messages: [],
    });
  });

  it("defaults compareRef to the upstream ref and never throws when there is none", async () => {
    const advisory = await concurrencyAdvisory(dir, { skipFetch: true });

    expect(advisory.compareRef).toBe("@{u}");
    expect(advisory.paths).toEqual([]);
    expect(advisory.messages).toEqual([]);
  });

  it("reports multiple changed paths, sorted and deduped", async () => {
    await runGit(["checkout", "-b", "other"], dir);
    await writeFile(join(dir, "b.md"), "b\n", "utf8");
    await writeFile(join(dir, "a.md"), "a\n", "utf8");
    await runGit(["add", "-A"], dir);
    await runGit(["commit", "-m", "two files"], dir);
    await runGit(["checkout", "main"], dir);

    const advisory = await concurrencyAdvisory(dir, { compareRef: "other", skipFetch: true });

    expect(advisory.paths).toEqual(["a.md", "b.md"]);
  });

  it("reports no advisory when the compare branch has no changes beyond HEAD", async () => {
    await runGit(["checkout", "-b", "other"], dir);
    await runGit(["checkout", "main"], dir);

    const advisory = await concurrencyAdvisory(dir, { compareRef: "other", skipFetch: true });

    expect(advisory.paths).toEqual([]);
    expect(advisory.messages).toEqual([]);
  });
});
