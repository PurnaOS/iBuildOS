import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { ClaimSchema } from "@ibuildos/schemas";
import { isRecord } from "../graph/graph.js";
import { runGit } from "../git/run-git.js";
import { type Claim } from "../rules/merge.js";
import {
  parseOkfDocument,
  serializeOkfDocument,
  setScalarField,
  type OkfDocument,
} from "../store/okf-document.js";

// SPEC.md area BD (Build Orchestration) + FORMATS.md §11 — worktree
// lifecycle for a stream: mint the branch nonce, add/remove the isolated
// git worktree via `git worktree` (T-006: system git CLI, argv arrays
// only — see ../git/run-git.ts), and read/write the stream's claim on its
// assigned story artifact (BD-017).

const NONCE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const NONCE_LENGTH = 4;

/**
 * Mint a fresh 4-char base36 nonce (FORMATS §11), matching
 * `StreamNonceSchema` in `@ibuildos/schemas`. Uses `crypto.randomBytes`
 * rather than `Math.random` — this nonce gates both the branch name and the
 * provisional-ID namespace (KB-010), so a collision would be a correctness
 * bug, not a cosmetic one.
 */
export function mintNonce(): string {
  const bytes = randomBytes(NONCE_LENGTH);
  let nonce = "";
  for (let i = 0; i < NONCE_LENGTH; i++) {
    nonce += NONCE_ALPHABET[bytes[i]! % NONCE_ALPHABET.length];
  }
  return nonce;
}

/**
 * `ibos/<work-id-lower>-<nonce>` (FORMATS §11). `workId` is the story/task
 * this stream is assigned to (BD-001); accepts either case and normalizes
 * to lowercase, since the branch-name grammar requires it even though
 * artifact IDs are canonically uppercase.
 */
export function streamBranchName(workId: string, nonce: string): string {
  return `ibos/${workId.toLowerCase()}-${nonce}`;
}

/**
 * `ibos/merge-<seq>` (FORMATS §11) — the branch name for a dedicated
 * integration worktree, used for IG-004 conflict-resolution sessions.
 */
export function integrationBranchName(seq: number | string): string {
  return `ibos/merge-${seq}`;
}

export interface AddWorktreeOptions {
  /** Path to any existing checkout of the repo — `git worktree add` is
   * repo-wide, it doesn't have to run from the main checkout. */
  repoPath: string;
  /** Filesystem path for the new worktree (BD-003 isolation: this is the
   * only filesystem/terminal surface the stream's agent session sees). */
  worktreePath: string;
  /** New branch to create for the worktree (`streamBranchName()` output). */
  branch: string;
  /** Commit-ish to branch from. Defaults to the current HEAD of `repoPath`. */
  startPoint?: string;
}

/** `git worktree add -b <branch> <worktreePath> [<startPoint>]` (T-006). */
export async function addWorktree(opts: AddWorktreeOptions): Promise<void> {
  const args = ["worktree", "add", "-b", opts.branch, opts.worktreePath];
  if (opts.startPoint) args.push(opts.startPoint);
  await runGit(args, opts.repoPath);
}

export interface RemoveWorktreeOptions {
  repoPath: string;
  worktreePath: string;
  /** Force removal even with uncommitted changes — BD-009's "abort and
   * dispose of the worktree" path (as opposed to "keep for inspection",
   * which is simply not calling this at all). */
  force?: boolean;
}

/** `git worktree remove [--force] <worktreePath>` (T-006). */
export async function removeWorktree(opts: RemoveWorktreeOptions): Promise<void> {
  const args = ["worktree", "remove"];
  if (opts.force) args.push("--force");
  args.push(opts.worktreePath);
  await runGit(args, opts.repoPath);
}

// --- BD-017: stream claims ---------------------------------------------
//
// `Claim` (`{by, machine, at}`, mirroring `ClaimSchema` in
// `@ibuildos/schemas`) is defined in `../rules/merge.js`, which
// `merge/superseded` compares a claim against — re-exported from here too
// so callers of this module's claim functions don't need a second import.

export type { Claim } from "../rules/merge.js";

/**
 * Locates a story/task artifact's file, given its ID. Bundle-scanning
 * (walking `docs/` to build this lookup) is a different work package's
 * concern — every function here that needs a path takes this as a
 * parameter instead of inventing its own scan.
 */
export type FindArtifactPath = (id: string) => string | null;

/** Resolve a `findArtifactPath` result (which may be absolute or relative)
 * against a base directory (a worktree root or the trunk checkout root). */
export function resolveArtifactPath(base: string, relativeOrAbsolute: string): string {
  return isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : join(base, relativeOrAbsolute);
}

/**
 * Read the `claim: {by, machine, at}` block off an artifact's frontmatter
 * (BD-017). Returns `null` if the artifact can't be found, or its `claim`
 * field is absent/malformed (both read as "no active claim").
 */
export async function readClaim(
  base: string,
  artifactId: string,
  findArtifactPath: FindArtifactPath,
): Promise<Claim | null> {
  const relPath = findArtifactPath(artifactId);
  if (!relPath) return null;
  const path = resolveArtifactPath(base, relPath);
  const raw = await readFile(path, "utf8");
  const { frontmatter } = parseOkfDocument(raw);
  const parsed = ClaimSchema.safeParse(frontmatter.claim);
  return parsed.success ? parsed.data : null;
}

/**
 * Thrown when `writeClaim`/`clearClaim` is asked to set a `claim:` block on
 * an artifact whose frontmatter doesn't already declare one.
 *
 * The OKF store's CST layer (`../store/okf-document.ts`) only supports
 * scalar *value* edits — `setScalarField` requires the target key to
 * already exist. Adding a brand-new top-level key is a structural edit,
 * which needs the "owned token-splice layer" TECH-STACK.md (T-007/G-41)
 * calls out as further work, not yet built, and out of this work package's
 * boundary (it would mean editing `store/okf-document.ts`, which isn't in
 * scope here). Rather than reach for the `yaml` package's `Document` API as
 * a workaround — which reformats the whole frontmatter block and is exactly
 * the shortcut AGENTS.md says not to introduce — this path fails loudly.
 * Claimable artifact types should pre-declare an empty `claim:` block at
 * scaffold time so this is never hit in practice; that's a different work
 * package's concern (scaffolding), noted here for whoever picks it up.
 */
export class ClaimFieldMissingError extends Error {
  constructor(artifactId: string) {
    super(
      `artifact "${artifactId}" has no existing "claim:" frontmatter block to update — ` +
        `structural field addition needs the OKF store's token-splice layer (T-007/G-41), ` +
        `not yet implemented; pre-declare an empty claim block at scaffold time`,
    );
    this.name = "ClaimFieldMissingError";
  }
}

function requireClaimBlock(doc: OkfDocument, artifactId: string): void {
  if (!isRecord(doc.frontmatter.claim)) {
    throw new ClaimFieldMissingError(artifactId);
  }
}

/**
 * Write `{by, machine, at}` into an existing `claim:` block via three
 * scalar-value edits (BD-017) — a minimal, targeted diff (see
 * `ClaimFieldMissingError` for what happens when there's no block to
 * target). Writes the file in place; committing it is the caller's job.
 */
export async function writeClaim(
  base: string,
  artifactId: string,
  claim: Claim,
  findArtifactPath: FindArtifactPath,
): Promise<void> {
  const relPath = findArtifactPath(artifactId);
  if (!relPath) throw new Error(`no artifact path found for "${artifactId}"`);
  const path = resolveArtifactPath(base, relPath);
  const raw = await readFile(path, "utf8");
  const doc = parseOkfDocument(raw);
  requireClaimBlock(doc, artifactId);
  setScalarField(doc, ["claim", "by"], claim.by);
  setScalarField(doc, ["claim", "machine"], claim.machine);
  setScalarField(doc, ["claim", "at"], claim.at);
  await writeFile(path, serializeOkfDocument(doc), "utf8");
}

/**
 * Clear a claim at landing (FORMATS §4: "cleared at landing") by blanking
 * its three scalar fields. The `claim:` key itself is left in place —
 * removing it outright is a structural edit, same limitation as
 * `ClaimFieldMissingError`. `readClaim` already treats a blank/invalid
 * claim as "no active claim" (it fails `ClaimSchema`), so blanking is
 * semantically equivalent to clearing for every reader in this codebase.
 */
export async function clearClaim(
  base: string,
  artifactId: string,
  findArtifactPath: FindArtifactPath,
): Promise<void> {
  const relPath = findArtifactPath(artifactId);
  if (!relPath) throw new Error(`no artifact path found for "${artifactId}"`);
  const path = resolveArtifactPath(base, relPath);
  const raw = await readFile(path, "utf8");
  const doc = parseOkfDocument(raw);
  requireClaimBlock(doc, artifactId);
  setScalarField(doc, ["claim", "by"], "");
  setScalarField(doc, ["claim", "machine"], "");
  setScalarField(doc, ["claim", "at"], "");
  await writeFile(path, serializeOkfDocument(doc), "utf8");
}
