import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit } from "../git/run-git.js";
import { addWorktree } from "./worktree.js";
import {
  MergeQueue,
  decideRebasePolicy,
  finalizeProvisionalIds,
  type FinalizeFile,
} from "./merge-queue.js";

// --- shared helpers ---------------------------------------------------

/** A stateful per-prefix counter, matching what `MergeQueue` keeps
 * internally — exposed here so the pure `finalizeProvisionalIds` unit
 * tests can supply the same kind of allocator without a whole queue. */
function makeAllocator(seed: Record<string, number> = {}): (prefix: string) => number {
  const counters = new Map(Object.entries(seed));
  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return next;
  };
}

// Every stream worktree a test creates lives as a sibling of `repoPath`
// *inside* this same root, so the one `finally` below cleans up the repo
// *and* every worktree even if a test fails midway through (before reaching
// its own `rm(wt, …)` cleanup) — `worktreePathFor` relies on this.
async function withTempRepo(fn: (repoPath: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ibuildos-mergequeue-"));
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

function storyContent(id: string, verifiedBy: string[] = []): string {
  const links = verifiedBy.length > 0 ? `links:\n  verified_by: [${verifiedBy.join(", ")}]\n` : "";
  return `---
type: Story
id: ${id}
title: "Stream story"
state: building
owner: US-0001
provenance: agent
created: 2026-08-14
${links}claim: { by: "", machine: "", at: "1970-01-01T00:00:00Z" }
---

Story body referencing ${verifiedBy.join(", ") || "nothing yet"}.
`;
}

function testCaseContent(id: string, verifies: string): string {
  return `---
type: TestCase
id: ${id}
title: "Generated test"
state: draft
owner: US-0001
provenance: agent
created: 2026-08-14
links:
  verifies: [${verifies}]
---

Verifies ${verifies} — see [${verifies}](../stories/${verifies.toLowerCase()}.md).
`;
}

// --- finalizeProvisionalIds (pure) -------------------------------------

describe("finalizeProvisionalIds", () => {
  it("rewrites frontmatter links, body markdown links (label + path), and a criterion reference — one number per prefix, in prefix/count order", () => {
    const story: FinalizeFile = {
      path: "docs/stories/st-pa3f9-1.md",
      content: `---
type: Story
id: ST-pa3f9-1
title: "Something"
state: building
owner: US-0001
provenance: agent
created: 2026-08-14
links:
  verified_by: [TC-pa3f9-1, TC-pa3f9-2]
---

See [TC-pa3f9-2](../tests/tc-pa3f9-2.md) for coverage; criterion ST-pa3f9-1#AC-1 confirms it.
`,
    };
    const tc1: FinalizeFile = {
      path: "docs/tests/tc-pa3f9-1.md",
      content: `---
type: TestCase
id: TC-pa3f9-1
title: "Case 1"
state: draft
owner: US-0001
provenance: agent
created: 2026-08-14
links:
  verifies: [ST-pa3f9-1]
---

Verifies ST-pa3f9-1.
`,
    };
    const tc2: FinalizeFile = {
      path: "docs/tests/tc-pa3f9-2.md",
      content: `---
type: TestCase
id: TC-pa3f9-2
title: "Case 2"
state: draft
owner: US-0001
provenance: agent
created: 2026-08-14
links:
  verifies: [ST-pa3f9-1]
---

Verifies ST-pa3f9-1.
`,
    };

    const result = finalizeProvisionalIds("a3f9", [story, tc1, tc2], makeAllocator());

    expect([...result.finalized.entries()]).toEqual([
      ["ST-pa3f9-1", "ST-0001"],
      ["TC-pa3f9-1", "TC-0001"],
      ["TC-pa3f9-2", "TC-0002"],
    ]);

    const outStory = result.files.find((f) => f.renamedFrom === "docs/stories/st-pa3f9-1.md")!;
    expect(outStory.path).toBe("docs/stories/st-0001.md");
    expect(outStory.content).toBe(`---
type: Story
id: ST-0001
title: "Something"
state: building
owner: US-0001
provenance: agent
created: 2026-08-14
links:
  verified_by: [TC-0001, TC-0002]
---

See [TC-0002](../tests/tc-0002.md) for coverage; criterion ST-0001#AC-1 confirms it.
`);

    const outTc1 = result.files.find((f) => f.renamedFrom === "docs/tests/tc-pa3f9-1.md")!;
    expect(outTc1.path).toBe("docs/tests/tc-0001.md");
    expect(outTc1.content).toContain("id: TC-0001");
    expect(outTc1.content).toContain("verifies: [ST-0001]");
    expect(outTc1.content).toContain("Verifies ST-0001.");

    const outTc2 = result.files.find((f) => f.renamedFrom === "docs/tests/tc-pa3f9-2.md")!;
    expect(outTc2.path).toBe("docs/tests/tc-0002.md");
    expect(outTc2.content).toContain("id: TC-0002");
  });

  it("leaves a provisional ID belonging to a different stream's nonce untouched", () => {
    const file: FinalizeFile = {
      path: "docs/stories/st-paaaa-1.md",
      content: `---
type: Story
id: ST-paaaa-1
title: "Mine"
state: building
owner: US-0001
provenance: agent
created: 2026-08-14
links:
  depends_on: [ST-pbbbb-1]
---

Depends on ST-pbbbb-1, which belongs to a different stream entirely.
`,
    };

    const result = finalizeProvisionalIds("aaaa", [file], makeAllocator());
    expect(result.finalized.size).toBe(1);
    expect(result.finalized.has("ST-paaaa-1")).toBe(true);
    const out = result.files[0]!;
    expect(out.content).toContain("id: ST-0001");
    // the foreign nonce's provisional id is untouched, verbatim
    expect(out.content).toContain("depends_on: [ST-pbbbb-1]");
    expect(out.content).toContain("Depends on ST-pbbbb-1");
  });

  it("continues per-prefix numbering from a seeded allocator (as if trunk already had entries)", () => {
    const file: FinalizeFile = {
      path: "docs/tests/tc-pzzzz-1.md",
      content: `---
type: TestCase
id: TC-pzzzz-1
title: "Case"
state: draft
owner: US-0001
provenance: agent
created: 2026-08-14
---

Body.
`,
    };
    const result = finalizeProvisionalIds("zzzz", [file], makeAllocator({ TC: 32 }));
    expect(result.finalized.get("TC-pzzzz-1")).toBe("TC-0033");
  });
});

// --- decideRebasePolicy (pure) ------------------------------------------

describe("decideRebasePolicy (IG-007)", () => {
  it("clean + cruise -> auto-rebase", () => {
    expect(decideRebasePolicy("clean", "cruise")).toBe("auto-rebase");
  });
  it("conflicted + cruise -> agent-assisted", () => {
    expect(decideRebasePolicy("conflicted", "cruise")).toBe("agent-assisted");
  });
  it("clean + auto -> auto-rebase", () => {
    expect(decideRebasePolicy("clean", "auto")).toBe("auto-rebase");
  });
  it("step dial always notifies, regardless of signal", () => {
    expect(decideRebasePolicy("clean", "step")).toBe("notify-only");
    expect(decideRebasePolicy("conflicted", "step")).toBe("notify-only");
  });
  it("defaults to cruise when no dial given", () => {
    expect(decideRebasePolicy("clean")).toBe("auto-rebase");
  });
});

// --- MergeQueue (real git repos) ----------------------------------------

/** A worktree path sibling to `repoPath`, inside `withTempRepo`'s per-test
 * root (see its comment) — so a fixed `suffix` like `"wt-aaaa"` is still
 * safe to reuse across tests without collision, and gets cleaned up even if
 * the test fails before its own `rm(wt, …)` call. */
function worktreePathFor(repoPath: string, suffix: string): string {
  return join(repoPath, "..", suffix);
}

function findArtifactPath(id: string): string | null {
  if (/^ST-/i.test(id)) return `docs/stories/${id.toLowerCase()}.md`;
  if (/^TC-/i.test(id)) return `docs/tests/${id.toLowerCase()}.md`;
  return null;
}

describe("MergeQueue.land — IG-009 atomic landing + KB-010 finalization", () => {
  it("lands two streams sequentially, each minting a provisional TestCase under the same prefix, with a byte-verified single-commit rewrite", async () => {
    await withTempRepo(async (repoPath) => {
      await mkdir(join(repoPath, "docs", "stories"), { recursive: true });
      await mkdir(join(repoPath, "docs", "tests"), { recursive: true });
      await writeFile(join(repoPath, "docs", "stories", "st-0001.md"), storyContent("ST-0001"), "utf8");
      await writeFile(join(repoPath, "docs", "stories", "st-0002.md"), storyContent("ST-0002"), "utf8");
      const untouched = "# Project notes\n\nNothing here changes.\n";
      await writeFile(join(repoPath, "README.md"), untouched, "utf8");
      await runGit(["add", "-A"], repoPath);
      await runGit(["commit", "-m", "trunk: seed stories"], repoPath);

      const queue = new MergeQueue({ repoPath, checkTrunkGates: () => true, findArtifactPath });

      // --- stream A: ST-0001, nonce aaaa, mints TC-paaaa-1 ---
      const wtA = worktreePathFor(repoPath, "wt-aaaa");
      await addWorktree({ repoPath, worktreePath: wtA, branch: "ibos/st-0001-aaaa", startPoint: "main" });
      await mkdir(join(wtA, "docs", "tests"), { recursive: true });
      await writeFile(
        join(wtA, "docs", "stories", "st-0001.md"),
        storyContent("ST-0001", ["TC-paaaa-1"]),
        "utf8",
      );
      await writeFile(join(wtA, "docs", "tests", "tc-paaaa-1.md"), testCaseContent("TC-paaaa-1", "ST-0001"), "utf8");
      const beforeA = await runGit(["rev-parse", "HEAD"], wtA);

      const resultA = await queue.land({
        streamId: "ST-0001/aaaa",
        nonce: "aaaa",
        storyId: "ST-0001",
        worktreePath: wtA,
        branch: "ibos/st-0001-aaaa",
        changedFiles: ["docs/stories/st-0001.md", "docs/tests/tc-paaaa-1.md"],
        claim: { by: "US-0001", machine: "machine-a", at: "2026-08-14T09:00:00Z" },
        runId: "RN-0001",
      });

      expect(resultA.kind).toBe("landed");
      if (resultA.kind !== "landed") throw new Error("unreachable");
      expect([...resultA.finalized.entries()]).toEqual([["TC-paaaa-1", "TC-0001"]]);

      // exactly one new commit landed the finalization on the stream branch
      const afterA = await runGit(["rev-parse", "HEAD"], wtA);
      const countA = await runGit(["rev-list", "--count", `${beforeA.stdout.trim()}..${afterA.stdout.trim()}`], wtA);
      expect(countA.stdout.trim()).toBe("1");

      // FORMATS §11 landing trailers are on trunk's own HEAD (the merge
      // commit) -- discoverable via `git log --first-parent` without ever
      // walking into the stream's branch history.
      const trunkMessage = await runGit(["log", "-1", "--format=%B"], repoPath);
      expect(trunkMessage.stdout).toContain("iBuildOS-Stream: ST-0001/aaaa");
      expect(trunkMessage.stdout).toContain("iBuildOS-Lands: ST-0001");
      expect(trunkMessage.stdout).toContain("iBuildOS-Run: RN-0001");
      expect(trunkMessage.stdout).toContain("iBuildOS-Finalized: TC-paaaa-1=TC-0001");

      const tc0001 = await readFile(join(repoPath, "docs", "tests", "tc-0001.md"), "utf8");
      expect(tc0001).toBe(`---
type: TestCase
id: TC-0001
title: "Generated test"
state: draft
owner: US-0001
provenance: agent
created: 2026-08-14
links:
  verifies: [ST-0001]
---

Verifies ST-0001 — see [ST-0001](../stories/st-0001.md).
`);
      await expect(readFile(join(repoPath, "docs", "tests", "tc-paaaa-1.md"), "utf8")).rejects.toThrow();

      const st0001AfterA = await readFile(join(repoPath, "docs", "stories", "st-0001.md"), "utf8");
      expect(st0001AfterA).toContain("verified_by: [TC-0001]");
      expect(st0001AfterA).toContain('claim: { by: "", machine: "", at: "" }');

      // README never touched by the landing
      expect(await readFile(join(repoPath, "README.md"), "utf8")).toBe(untouched);

      // --- stream B: ST-0002, nonce bbbb, mints TC-pbbbb-1 (same prefix) ---
      const wtB = worktreePathFor(repoPath, "wt-bbbb");
      await addWorktree({ repoPath, worktreePath: wtB, branch: "ibos/st-0002-bbbb", startPoint: "main" });
      await mkdir(join(wtB, "docs", "tests"), { recursive: true });
      await writeFile(
        join(wtB, "docs", "stories", "st-0002.md"),
        storyContent("ST-0002", ["TC-pbbbb-1"]),
        "utf8",
      );
      await writeFile(join(wtB, "docs", "tests", "tc-pbbbb-1.md"), testCaseContent("TC-pbbbb-1", "ST-0002"), "utf8");

      const resultB = await queue.land({
        streamId: "ST-0002/bbbb",
        nonce: "bbbb",
        storyId: "ST-0002",
        worktreePath: wtB,
        branch: "ibos/st-0002-bbbb",
        changedFiles: ["docs/stories/st-0002.md", "docs/tests/tc-pbbbb-1.md"],
        claim: { by: "US-0001", machine: "machine-b", at: "2026-08-14T09:05:00Z" },
      });

      expect(resultB.kind).toBe("landed");
      if (resultB.kind !== "landed") throw new Error("unreachable");
      // "next free number per prefix": TC continues from 1 (A) to 2 (B), same prefix
      expect([...resultB.finalized.entries()]).toEqual([["TC-pbbbb-1", "TC-0002"]]);

      const tc0002 = await readFile(join(repoPath, "docs", "tests", "tc-0002.md"), "utf8");
      expect(tc0002).toContain("id: TC-0002");
      expect(tc0002).toContain("verifies: [ST-0002]");

      const st0002AfterB = await readFile(join(repoPath, "docs", "stories", "st-0002.md"), "utf8");
      expect(st0002AfterB).toContain("verified_by: [TC-0002]");

      // stream A's landed files are completely untouched by stream B's landing
      expect(await readFile(join(repoPath, "docs", "tests", "tc-0001.md"), "utf8")).toBe(tc0001);
      expect(await readFile(join(repoPath, "docs", "stories", "st-0001.md"), "utf8")).toBe(st0001AfterA);
      expect(await readFile(join(repoPath, "README.md"), "utf8")).toBe(untouched);

      await rm(wtA, { recursive: true, force: true });
      await rm(wtB, { recursive: true, force: true });
    });
  });

  it("serializes an ordered-resource collision: the second concurrent attempt is refused while the first is landing, then succeeds once the first has landed", async () => {
    await withTempRepo(async (repoPath) => {
      await mkdir(join(repoPath, "docs", "stories"), { recursive: true });
      await writeFile(join(repoPath, "docs", "stories", "st-0001.md"), storyContent("ST-0001"), "utf8");
      await writeFile(join(repoPath, "docs", "stories", "st-0002.md"), storyContent("ST-0002"), "utf8");
      await runGit(["add", "-A"], repoPath);
      await runGit(["commit", "-m", "trunk: seed stories"], repoPath);

      const queue = new MergeQueue({ repoPath, checkTrunkGates: () => true, findArtifactPath });

      const wtA = worktreePathFor(repoPath, "wt-aaaa");
      await addWorktree({ repoPath, worktreePath: wtA, branch: "ibos/st-0001-aaaa", startPoint: "main" });
      const wtB = worktreePathFor(repoPath, "wt-bbbb");
      await addWorktree({ repoPath, worktreePath: wtB, branch: "ibos/st-0002-bbbb", startPoint: "main" });

      const migration = { component: "api", name: "migrate" };
      const reqA = {
        streamId: "ST-0001/aaaa",
        nonce: "aaaa",
        storyId: "ST-0001",
        worktreePath: wtA,
        branch: "ibos/st-0001-aaaa",
        changedFiles: [] as string[],
        orderedResources: [migration],
      };
      const reqB = {
        streamId: "ST-0002/bbbb",
        nonce: "bbbb",
        storyId: "ST-0002",
        worktreePath: wtB,
        branch: "ibos/st-0002-bbbb",
        changedFiles: [] as string[],
        orderedResources: [migration],
      };

      // Call both without awaiting the first: the ordered-resource lock is
      // acquired synchronously, so whichever call happens first in program
      // order deterministically wins it (see MergeQueue.land's doc comment).
      const pA = queue.land(reqA);
      const pB = queue.land(reqB);
      const [resultA, resultB] = await Promise.all([pA, pB]);

      expect(resultA.kind).toBe("landed");
      expect(resultB.kind).toBe("blocked-ordered-resource");
      if (resultB.kind === "blocked-ordered-resource") {
        expect(resultB.findings[0]).toMatchObject({ rule: "merge/ordered-resource", artifact: "ST-0002/bbbb" });
      }

      // Once A has actually landed, the resource is free again — B retries and succeeds.
      const resultBRetry = await queue.land(reqB);
      expect(resultBRetry.kind).toBe("landed");

      await rm(wtA, { recursive: true, force: true });
      await rm(wtB, { recursive: true, force: true });
    });
  });

  it("lands cleanly when there is nothing new to commit (no claim block, no provisional IDs, all work already committed)", async () => {
    await withTempRepo(async (repoPath) => {
      await mkdir(join(repoPath, "docs", "stories"), { recursive: true });
      // Deliberately no `claim:` block at all, so `findArtifactPath` still
      // resolves it but `performLanding` has nothing to clear.
      const noClaimStory = `---
type: Story
id: ST-0007
title: "Already fully committed"
state: building
owner: US-0001
provenance: agent
created: 2026-08-14
---

Nothing left to rewrite here.
`;
      await writeFile(join(repoPath, "docs", "stories", "st-0007.md"), noClaimStory, "utf8");
      await runGit(["add", "-A"], repoPath);
      await runGit(["commit", "-m", "trunk: seed st-0007"], repoPath);

      const queue = new MergeQueue({ repoPath, checkTrunkGates: () => true, findArtifactPath });
      const wt = worktreePathFor(repoPath, "wt-eeee");
      await addWorktree({ repoPath, worktreePath: wt, branch: "ibos/st-0007-eeee", startPoint: "main" });
      // The stream did real work, but per-task commits (BD-006) already
      // captured all of it -- by landing time there's nothing uncommitted,
      // and it minted no provisional IDs.
      await writeFile(join(wt, "docs", "stories", "st-0007.md"), noClaimStory.replace("state: building", "state: building\nestimate: 2"), "utf8");
      await runGit(["add", "-A"], wt);
      await runGit(["commit", "-m", "task: bump estimate"], wt);
      const beforeHead = await runGit(["rev-parse", "HEAD"], wt);

      const result = await queue.land({
        streamId: "ST-0007/eeee",
        nonce: "eeee",
        storyId: "ST-0007",
        worktreePath: wt,
        branch: "ibos/st-0007-eeee",
        changedFiles: [],
      });

      expect(result.kind).toBe("landed");

      // no separate landing commit was made on the stream branch -- there
      // was nothing to add to it
      const afterHead = await runGit(["rev-parse", "HEAD"], wt);
      expect(afterHead.stdout).toBe(beforeHead.stdout);

      // trunk still gained the merge itself, carrying the trailers
      const trunkMessage = await runGit(["log", "-1", "--format=%B"], repoPath);
      expect(trunkMessage.stdout).toContain("iBuildOS-Lands: ST-0007");

      await rm(wt, { recursive: true, force: true });
    });
  });

  it("returns a supersession disposition instead of landing when the assigned story is already done on trunk", async () => {
    await withTempRepo(async (repoPath) => {
      await mkdir(join(repoPath, "docs", "stories"), { recursive: true });
      const doneStory = `---
type: Story
id: ST-0005
title: "Already shipped"
state: done
owner: US-0001
provenance: agent
created: 2026-08-14
---

Already landed by someone else.
`;
      await writeFile(join(repoPath, "docs", "stories", "st-0005.md"), doneStory, "utf8");
      await runGit(["add", "-A"], repoPath);
      await runGit(["commit", "-m", "trunk: st-0005 already done"], repoPath);

      const queue = new MergeQueue({ repoPath, checkTrunkGates: () => true, findArtifactPath });

      const wt = worktreePathFor(repoPath, "wt-cccc");
      await addWorktree({ repoPath, worktreePath: wt, branch: "ibos/st-0005-cccc", startPoint: "main" });
      const beforeHead = await runGit(["rev-parse", "HEAD"], repoPath);

      const result = await queue.land({
        streamId: "ST-0005/cccc",
        nonce: "cccc",
        storyId: "ST-0005",
        worktreePath: wt,
        branch: "ibos/st-0005-cccc",
        changedFiles: [],
      });

      expect(result.kind).toBe("superseded");
      if (result.kind === "superseded") {
        expect(result.findings[0]).toMatchObject({ rule: "merge/superseded", subject: "state" });
      }
      // trunk was never touched by the rejected landing attempt
      const afterHead = await runGit(["rev-parse", "HEAD"], repoPath);
      expect(afterHead.stdout).toBe(beforeHead.stdout);

      await rm(wt, { recursive: true, force: true });
    });
  });

  it("IG-010: a trunk-broken gate pauses the queue until resume()", async () => {
    await withTempRepo(async (repoPath) => {
      await runGit(["commit", "--allow-empty", "-m", "init"], repoPath);
      let gatesGreen = false;
      const queue = new MergeQueue({ repoPath, checkTrunkGates: () => gatesGreen, findArtifactPath });

      const wt = worktreePathFor(repoPath, "wt-dddd");
      await addWorktree({ repoPath, worktreePath: wt, branch: "ibos/st-0009-dddd", startPoint: "main" });
      await mkdir(join(wt, "docs", "stories"), { recursive: true });
      await writeFile(join(wt, "docs", "stories", "st-0009.md"), storyContent("ST-0009"), "utf8");

      const req = {
        streamId: "ST-0009/dddd",
        nonce: "dddd",
        storyId: "ST-0009",
        worktreePath: wt,
        branch: "ibos/st-0009-dddd",
        changedFiles: [],
      };

      expect(await queue.land(req)).toEqual({ kind: "trunk-broken" });
      expect(queue.isPaused).toBe(true);

      // still paused even once gates recover, until explicitly resumed
      gatesGreen = true;
      expect(await queue.land(req)).toEqual({ kind: "trunk-broken" });

      queue.resume();
      expect(queue.isPaused).toBe(false);
      const result = await queue.land(req);
      expect(result.kind).toBe("landed");

      await rm(wt, { recursive: true, force: true });
    });
  });
});
