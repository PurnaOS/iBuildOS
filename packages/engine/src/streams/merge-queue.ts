import { readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { CST } from "yaml";
import { ID_PREFIXES, type Finding } from "@ibuildos/schemas";
import { parseOkfDocument, serializeOkfDocument, type OkfDocument } from "../store/okf-document.js";
import { runGit } from "../git/run-git.js";
import {
  checkMergeOrderedResource,
  checkMergeSuperseded,
  type Claim,
  type InFlightStream,
  type OrderedResourceTouch,
} from "../rules/merge.js";
import { ClaimFieldMissingError, clearClaim, resolveArtifactPath, type FindArtifactPath } from "./worktree.js";

// SPEC.md area IG (Integration, Merge & Conflicts) + FORMATS.md §2 (KB-010
// provisional-ID finalization) + §11 (git conventions). The merge queue is
// "the single allocator per landing" (KB-010): it turns a completed
// stream's worktree into a trunk-landed commit, atomically (IG-009)
// rewriting every provisional ID the stream minted alongside the code that
// uses them.

// --- KB-010: provisional-ID finalization --------------------------------

const PREFIX_ALTERNATION = ID_PREFIXES.join("|");

/** Matches a provisional ID anywhere in text (frontmatter scalar or body
 * markdown), case-insensitive per FORMATS §2 ("case-insensitive on input,
 * canonical uppercase on write"). Bounded on both sides so a longer run
 * number (`…-20`) never matches as a prefix of a shorter one (`…-2`) by
 * accident, and so the match doesn't bleed into surrounding word
 * characters. */
const PROVISIONAL_SCAN = new RegExp(
  `(?<![0-9A-Za-z])(${PREFIX_ALTERNATION})-p([0-9a-z]{4})-(\\d+)(?![0-9A-Za-z])`,
  "gi",
);

/** Parse a provisional-ID-shaped string into its canonical form:
 * `PREFIX` uppercased, nonce lowercased, count untouched — this is the key
 * shape used throughout this module's maps (`Map<canonicalOldId, newId>`),
 * so lookups don't care how a given occurrence happened to be cased. */
function canonicalProvisionalId(match: string): { key: string; prefix: string } | null {
  const re = new RegExp(`^(${PREFIX_ALTERNATION})-p([0-9a-z]{4})-(\\d+)$`, "i");
  const m = re.exec(match);
  if (!m) return null;
  const prefix = m[1]!.toUpperCase();
  const nonce = m[2]!.toLowerCase();
  const n = m[3]!;
  return { key: `${prefix}-p${nonce}-${n}`, prefix };
}

/** Replace `match` with `newId`, mirroring `match`'s own case register
 * (upper if the occurrence's prefix was upper — the canonical/label style —
 * lower otherwise, e.g. a lowercase filename embedded in a markdown link
 * path). Filenames are lowercase-only by grammar (FORMATS §3); labels are
 * conventionally uppercase — a blind single-case replacement would either
 * capitalize a path or lowercase a label, both wrong. */
function caseLikeMatch(match: string, newId: string): string {
  const prefixPart = match.slice(0, match.indexOf("-"));
  return prefixPart === prefixPart.toUpperCase() ? newId : newId.toLowerCase();
}

/** Depth-first walk of every scalar token in a frontmatter CST (map values
 * *and* sequence items — `links:` targets are flow-sequence items, which
 * `store/okf-document.ts`'s `setScalarField` can't reach since it only
 * navigates map-key paths). Rewrites in place via `CST.setScalarValue`,
 * exactly the "CST tooling" TECH-STACK.md T-007 names, just applied
 * generically instead of by fixed key path. */
function rewriteFrontmatterCst(tokens: CST.Token[], mapping: ReadonlyMap<string, string>): void {
  for (const token of tokens) {
    if (token.type !== "document") continue;
    CST.visit(token, (item) => {
      if (!item.value) return;
      const resolved = CST.resolveAsScalar(item.value);
      if (!resolved) return;
      const updated = resolved.value.replace(PROVISIONAL_SCAN, (m) => {
        const canon = canonicalProvisionalId(m);
        const newId = canon && mapping.get(canon.key);
        return newId ? caseLikeMatch(m, newId) : m;
      });
      if (updated !== resolved.value) {
        CST.setScalarValue(item.value, updated);
      }
    });
  }
}

function rewriteBodyText(body: string, mapping: ReadonlyMap<string, string>): string {
  return body.replace(PROVISIONAL_SCAN, (m) => {
    const canon = canonicalProvisionalId(m);
    const newId = canon && mapping.get(canon.key);
    return newId ? caseLikeMatch(m, newId) : m;
  });
}

/** One file as `finalizeProvisionalIds` sees it — no filesystem access in
 * this function, matching the rest of this package's "inject the file
 * list, don't invent a scan" convention (`chain.ts`'s `checkTaskNoCode`,
 * `allFiles`). */
export interface FinalizeFile {
  /** Path as supplied by the caller (repo- or worktree-relative). */
  path: string;
  content: string;
}

/** One output file: `path` is the *final* path (post-rename, if any);
 * `renamedFrom` is set when this file's own `id:` was one of the finalized
 * provisional IDs, so its filename (FORMATS §3: filename = id, lowercase)
 * has to change too. */
export interface FinalizedFile {
  path: string;
  content: string;
  renamedFrom?: string;
}

export interface FinalizeResult {
  files: FinalizedFile[];
  /** `oldId -> newId`, canonical form, sorted by old id — the source for
   * the landing commit's `iBuildOS-Finalized` trailer (FORMATS §11). */
  finalized: Map<string, string>;
}

function isOkfDocument(content: string): boolean {
  return content.startsWith("---\n");
}

function idParts(canonicalKey: string): { prefix: string; n: number } {
  const [prefix, , n] = canonicalKey.split("-");
  return { prefix: prefix!, n: Number(canonicalKey.slice(canonicalKey.lastIndexOf("-") + 1)) };
}

/**
 * KB-010's finalization step, run once per landing stream: find every
 * provisional ID *belonging to this stream's own nonce* across `files`
 * (frontmatter `links:`, body text, criterion references — one pass, since
 * they're all just occurrences of the same scan pattern in different
 * contexts), assign each the next free final number per prefix (via the
 * caller-owned `allocateFinalNumber` — KB-010: "the merge queue [is] the
 * single allocator per landing", so *this* module owns call order, not the
 * numbers themselves; `MergeQueue` below supplies a stateful counter),
 * rewrite every occurrence byte-precisely, and compute the file rename for
 * each provisional ID's defining file. Pure — no filesystem or git access,
 * so the whole rewrite is trivially testable and trivially inspectable
 * before anything touches disk.
 *
 * Provisional IDs belonging to a *different* nonce than `nonce` are left
 * untouched (KB-010 rule 1: they're only valid within the stream that
 * minted them, so a foreign one showing up here would be a bug elsewhere,
 * not this function's to "fix").
 */
export function finalizeProvisionalIds(
  nonce: string,
  files: readonly FinalizeFile[],
  allocateFinalNumber: (prefix: string) => number,
): FinalizeResult {
  const discovered = new Set<string>();
  for (const file of files) {
    for (const m of file.content.matchAll(PROVISIONAL_SCAN)) {
      const [, , matchedNonce] = m;
      if (matchedNonce!.toLowerCase() !== nonce.toLowerCase()) continue;
      const canon = canonicalProvisionalId(m[0]);
      if (canon) discovered.add(canon.key);
    }
  }

  const ordered = [...discovered].sort((a, b) => {
    const pa = idParts(a);
    const pb = idParts(b);
    if (pa.prefix !== pb.prefix) return pa.prefix < pb.prefix ? -1 : 1;
    return pa.n - pb.n;
  });

  const mapping = new Map<string, string>();
  for (const oldId of ordered) {
    const { prefix } = idParts(oldId);
    const num = allocateFinalNumber(prefix);
    mapping.set(oldId, `${prefix}-${String(num).padStart(4, "0")}`);
  }

  const outFiles: FinalizedFile[] = [];
  for (const file of files) {
    if (!isOkfDocument(file.content)) {
      outFiles.push({ path: file.path, content: rewriteBodyText(file.content, mapping) });
      continue;
    }

    const doc: OkfDocument = parseOkfDocument(file.content);
    const ownId = typeof doc.frontmatter.id === "string" ? doc.frontmatter.id : undefined;
    const ownCanon = ownId ? canonicalProvisionalId(ownId) : null;
    const newOwnId = ownCanon ? mapping.get(ownCanon.key) : undefined;

    rewriteFrontmatterCst(doc.cstTokens, mapping);
    doc.body = rewriteBodyText(doc.body, mapping);
    const newContent = serializeOkfDocument(doc);

    if (newOwnId) {
      const newPath = join(dirname(file.path), `${newOwnId.toLowerCase()}${extname(file.path)}`);
      outFiles.push({ path: newPath, content: newContent, renamedFrom: file.path });
    } else {
      outFiles.push({ path: file.path, content: newContent });
    }
  }

  return { files: outFiles, finalized: mapping };
}

// --- IG-007: post-merge reconciliation policy ---------------------------

export type RebaseDisposition = "auto-rebase" | "agent-assisted" | "notify-only";

/**
 * IG-007: after each trunk advance, an in-flight stream is reconciled
 * per policy — auto-rebase when the rebase would be clean, agent-assisted
 * when it would conflict. Actually running `git rebase` (or starting an
 * agent session) is the caller's job; `signal` is injected, not computed
 * here (the task boundary is explicit about this — see the module's
 * caller). This is a pure decision function.
 *
 * **Judgment call** (not stated in these exact terms by SPEC IG-007):
 * when the project's autonomy dial (BD-004) is `step`, every stage
 * transition awaits an explicit human action — a mid-flight rebase
 * reconciliation is exactly such a transition, so this policy treats
 * `step` as "notify and wait" regardless of whether the rebase itself
 * would be clean. `cruise`/`auto` fall through to the clean/conflicted
 * split IG-007's prose describes directly.
 */
export function decideRebasePolicy(
  signal: "clean" | "conflicted",
  dial: "step" | "cruise" | "auto" = "cruise",
): RebaseDisposition {
  if (dial === "step") return "notify-only";
  return signal === "clean" ? "auto-rebase" : "agent-assisted";
}

// --- IG-002/009/010/011: the merge queue ---------------------------------

export interface LandingRequest {
  /** `<workId>/<nonce>` (FORMATS §11's `iBuildOS-Stream` trailer shape,
   * e.g. `"ST-0042/a3f9"`). Also this request's identity for ordered-
   * resource collision bookkeeping. */
  streamId: string;
  nonce: string;
  /** The story (or coherent task set head) this stream is landing. */
  storyId: string;
  /** The stream's own worktree — finalization reads/writes/`git mv`s here,
   * and the landing commit is made on the stream's own branch tip. */
  worktreePath: string;
  branch: string;
  /** Files this stream changed, worktree-relative (git-diff scanning is
   * the caller's job — see `../git/run-git.ts` for the primitive). */
  changedFiles: string[];
  orderedResources?: OrderedResourceTouch[];
  /** This stream's own claim (BD-017), if any — compared against trunk's
   * claim by `merge/superseded`. */
  claim?: Claim;
  agent?: { displayName?: string; identity?: string };
  runId?: string;
}

export type LandingDisposition =
  | { kind: "landed"; commit: string; finalized: Map<string, string> }
  | { kind: "trunk-broken" }
  | { kind: "superseded"; findings: Finding[] }
  | { kind: "blocked-ordered-resource"; findings: Finding[] }
  | { kind: "merge-conflict"; stderr: string };

export interface MergeQueueDeps {
  /** The trunk checkout landings merge into (IG-001..003). */
  repoPath: string;
  /** IG-010: whether trunk itself currently passes its gates. Evaluating
   * gates is `../gates`'s job (already built) — this module only reacts to
   * the boolean. */
  checkTrunkGates: () => boolean;
  /** Shared with `../streams/worktree.ts`'s claim functions — resolving an
   * artifact ID to a path is one concern, reused for both "where's this
   * story in the stream's worktree" and "where's this story on trunk". */
  findArtifactPath: FindArtifactPath;
  /** Seed for the per-prefix final-number counters — the highest number
   * already used on trunk for each prefix, e.g. `{TC: 32}` if `TC-0032` is
   * the highest existing TestCase. Scanning the bundle to produce this is
   * a different work package's concern (the same "don't invent a
   * bundle-scanning mechanism" boundary as `findArtifactPath`); this
   * module just needs somewhere to start counting. Defaults to empty
   * (every prefix starts at 1), which is only correct for an empty bundle
   * — real callers must supply the real counts. */
  initialFinalCounters?: Record<string, number>;
}

/**
 * KB-010's "single allocator per landing," IG-002's "ordered merge queue",
 * IG-011's ordered-resource serialization, and BD-017/IG-010's pause
 * states, together: one object because they share state that has to stay
 * consistent (the per-prefix counters must advance in the exact order
 * streams land; the ordered-resource lock and the trunk-broken pause both
 * gate whether a landing is even attempted).
 */
export class MergeQueue {
  private readonly counters: Map<string, number>;
  private readonly inFlight = new Map<string, InFlightStream>();
  private paused = false;

  constructor(private readonly deps: MergeQueueDeps) {
    this.counters = new Map(Object.entries(deps.initialFinalCounters ?? {}));
  }

  /** IG-010: true once a landing has observed trunk failing its own gates.
   * Stays true until `resume()` — modeling "the merge queue holds" as a
   * standing state, not a per-call re-check that could flap. */
  get isPaused(): boolean {
    return this.paused;
  }

  /** Clear the trunk-broken pause (IG-010's remediation flow — an agent
   * fix-forward stream landing, or a recorded quarantine — has resolved
   * trunk's gates; driving that remediation is out of this module's
   * scope). */
  resume(): void {
    this.paused = false;
  }

  private allocateFinalNumber = (prefix: string): number => {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return next;
  };

  private async trunkSnapshot(storyId: string): Promise<Record<string, unknown> | undefined> {
    const relPath = this.deps.findArtifactPath(storyId);
    if (!relPath) return undefined;
    const path = resolveArtifactPath(this.deps.repoPath, relPath);
    try {
      const raw = await readFile(path, "utf8");
      return parseOkfDocument(raw).frontmatter;
    } catch {
      return undefined; // not on trunk yet -- nothing to be superseded by
    }
  }

  /**
   * Attempt to land one stream. Order matters (a rejected landing must
   * never have burned a final ID number — IDs are append-only and never
   * reused, FORMATS §2): gates, then the ordered-resource lock, then
   * supersession, all checked *before* `finalizeProvisionalIds` is ever
   * called. Only once every check passes does this allocate numbers,
   * rewrite content, `git mv`, and commit — one commit, carrying code and
   * the ID rewrite together (IG-009).
   *
   * The gate check and the ordered-resource lock acquisition happen
   * entirely synchronously (no `await` between them) so that calling
   * `land()` for two streams back-to-back — without awaiting the first —
   * deterministically serializes them: whichever call the caller *makes
   * first* wins the lock, full stop, rather than racing on I/O completion
   * order. That's what makes IG-011 ("must not land concurrently")
   * actually true rather than "true most of the time."
   */
  async land(req: LandingRequest): Promise<LandingDisposition> {
    if (this.paused || !this.deps.checkTrunkGates()) {
      this.paused = true;
      return { kind: "trunk-broken" };
    }

    const resources = req.orderedResources ?? [];
    const others = [...this.inFlight.values()];
    const ordered = checkMergeOrderedResource(req.streamId, resources, others, "merge");
    if (ordered.some((f) => f.severity === "error")) {
      return { kind: "blocked-ordered-resource", findings: ordered };
    }

    this.inFlight.set(req.streamId, { streamId: req.streamId, resources });
    try {
      const trunk = await this.trunkSnapshot(req.storyId);
      const superseded = checkMergeSuperseded(req.storyId, trunk, req.claim, "merge");
      if (superseded.some((f) => f.severity === "error")) {
        return { kind: "superseded", findings: superseded };
      }

      return await this.performLanding(req);
    } finally {
      this.inFlight.delete(req.streamId);
    }
  }

  private async performLanding(req: LandingRequest): Promise<LandingDisposition> {
    // BD-017: the claim is cleared as part of the same landing commit as
    // the code + finalized IDs (IG-009) -- best-effort, since a claimable
    // artifact that never had a claim block declared (or doesn't have a
    // resolvable path at all -- `findArtifactPath` is free to return null)
    // has nothing to clear.
    if (this.deps.findArtifactPath(req.storyId)) {
      try {
        await clearClaim(req.worktreePath, req.storyId, this.deps.findArtifactPath);
      } catch (err) {
        if (!(err instanceof ClaimFieldMissingError)) throw err;
      }
    }

    const files = await Promise.all(
      req.changedFiles.map(async (path) => ({
        path,
        content: await readFile(resolveArtifactPath(req.worktreePath, path), "utf8"),
      })),
    );

    const result = finalizeProvisionalIds(req.nonce, files, this.allocateFinalNumber);

    // `git mv` (used below for provisional-ID renames, per FORMATS §2 rule 2
    // -- "git mv preserves history") requires its source to already be
    // tracked. A stream's newest files may still be sitting uncommitted in
    // its worktree at landing time (per-task commits, BD-006, aren't
    // guaranteed to have happened for the very last task) -- staging
    // everything once, at its pre-finalization content, guarantees every
    // renamed file's source is tracked before `git mv` ever runs. This
    // staged snapshot never becomes its own commit; it's folded into the
    // one landing commit below.
    await runGit(["add", "-A"], req.worktreePath);

    for (const file of result.files) {
      if (file.renamedFrom) {
        await writeFile(resolveArtifactPath(req.worktreePath, file.renamedFrom), file.content, "utf8");
        await runGit(["mv", file.renamedFrom, file.path], req.worktreePath);
      } else {
        await writeFile(resolveArtifactPath(req.worktreePath, file.path), file.content, "utf8");
      }
    }

    await runGit(["add", "-A"], req.worktreePath);

    const message = buildLandingCommitMessage(req, result.finalized);

    // A well-behaved stream may reach landing with everything already
    // committed (per-task commits, BD-006) and nothing to finalize (no
    // provisional IDs minted, no claim block to clear) -- in that case
    // there's genuinely nothing new to commit on the stream branch, and
    // `git commit` would fail ("nothing to commit"). `git diff --cached
    // --quiet` (exit 1 = there *are* staged changes) is the check; skipping
    // the commit in the empty case is correct, not a workaround -- IG-009
    // ("code and its rewrite in the same landing") is trivially satisfied
    // when there was no rewrite to carry.
    const staged = await runGit(["diff", "--cached", "--quiet"], req.worktreePath, { check: false });
    if (staged.exitCode !== 0) {
      await runGit(["commit", "-m", message], req.worktreePath);
    }

    // FORMATS §11's landing trailers (`iBuildOS-Lands`/`iBuildOS-Finalized`/
    // `iBuildOS-Stream`) go on the commit that actually lands on trunk: the
    // merge commit, not (only) the stream-branch tip -- `git log
    // --first-parent` on trunk needs to show what landed without walking
    // into the stream's own history.
    const merge = await runGit(["merge", "--no-ff", req.branch, "-m", message], this.deps.repoPath, {
      check: false,
    });
    if (merge.exitCode !== 0) {
      await runGit(["merge", "--abort"], this.deps.repoPath, { check: false });
      return { kind: "merge-conflict", stderr: merge.stderr };
    }

    const head = await runGit(["rev-parse", "HEAD"], this.deps.repoPath);
    return { kind: "landed", commit: head.stdout.trim(), finalized: result.finalized };
  }
}

/** FORMATS §11 landing-commit trailers: the standard per-app trailers plus
 * `iBuildOS-Lands` and (when finalization actually did anything)
 * `iBuildOS-Finalized`. */
export function buildLandingCommitMessage(req: LandingRequest, finalized: ReadonlyMap<string, string>): string {
  const trailers: string[] = [];
  if (req.agent?.displayName) {
    trailers.push(`Co-authored-by: ${req.agent.displayName} <agent@ibuildos.local>`);
  }
  if (req.agent?.identity) {
    trailers.push(`iBuildOS-Agent: ${req.agent.identity}`);
  }
  if (req.runId) {
    trailers.push(`iBuildOS-Run: ${req.runId}`);
  }
  trailers.push(`iBuildOS-Stream: ${req.streamId}`);
  trailers.push(`iBuildOS-Lands: ${req.storyId}`);
  if (finalized.size > 0) {
    const parts = [...finalized.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([o, n]) => `${o}=${n}`);
    trailers.push(`iBuildOS-Finalized: ${parts.join(",")}`);
  }

  const subject = `land: ${req.storyId} via stream ${req.streamId}`;
  return `${subject}\n\n${trailers.join("\n")}\n`;
}
