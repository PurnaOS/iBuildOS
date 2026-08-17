import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runGit } from "../git/run-git.js";

// SPEC.md GH-005 (PR pathway, optional forge integration: open/track PRs,
// read CI status into gates) and GH-007 (remote enforcement setup: one-click
// setup + ongoing verification of branch protection requiring the gate check
// VG-010 on trunk). `ForgeClient` is the abstraction both requirements are
// built against — shaped so a real GitHub-backed implementation (REST/GraphQL
// over HTTPS) can satisfy it later without changing callers. This module
// ships two implementations for THIS round, neither of which makes a live
// network call:
//
//   - `FixtureForgeClient` — reads canned JSON fixtures
//     (packages/engine/fixtures/forge/*.json) standing in for forge API
//     responses. Good for exercising GH-005/GH-007 call shapes and the
//     GH-007 rule's decision logic.
//   - `LocalGitRemoteForgeClient` — backed by a real local **bare** git
//     repository (`git init --bare`, via `runGit`). Good for the genuinely
//     git-level mechanics a forge API wraps (a branch landing on the
//     "remote"), and approximates branch-protection/CI-status storage with
//     real git primitives (`git config`, `git notes`) rather than an
//     in-memory mock — see the class doc comment below for exactly which
//     primitive backs which method.
//
// Unlike the artifact-oriented rule modules (security.ts, contract.ts, …)
// this module is I/O-bound by nature — a forge client always reads
// *something* (a file, a repo). The dependency-injection boundary here is
// the `ForgeClient` interface itself: rules.ts depends on the interface, not
// on either concrete implementation, so the GH-007 checker in rules.ts works
// unchanged against a fixture double, a local-git double, or (later) a real
// GitHub client.

// ---------------------------------------------------------------------------
// Wire shapes (hand-validated at the fixture-load boundary, matching the
// no-zod-in-packages/engine convention the other rule modules already follow
// — packages/engine has no direct dependency on zod; only @ibuildos/schemas
// does. A malformed fixture fails loudly here rather than silently producing
// a wrong Finding.)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type PullRequestState = "open" | "closed" | "merged";
const PULL_REQUEST_STATES: readonly PullRequestState[] = ["open", "closed", "merged"];

export interface PullRequestRef {
  number: number;
  url: string;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  state: PullRequestState;
}

function parsePullRequestRef(value: unknown, source: string): PullRequestRef {
  if (
    isRecord(value) &&
    typeof value.number === "number" &&
    typeof value.url === "string" &&
    typeof value.headBranch === "string" &&
    typeof value.baseBranch === "string" &&
    typeof value.headSha === "string" &&
    typeof value.state === "string" &&
    (PULL_REQUEST_STATES as readonly string[]).includes(value.state)
  ) {
    return {
      number: value.number,
      url: value.url,
      headBranch: value.headBranch,
      baseBranch: value.baseBranch,
      headSha: value.headSha,
      state: value.state as PullRequestState,
    };
  }
  throw new Error(`forge fixture "${source}" does not match the PullRequestRef shape`);
}

export interface OpenPullRequestParams {
  headBranch: string;
  baseBranch: string;
  title: string;
  body?: string;
}

export type CiCheckState = "pending" | "success" | "failure" | "error";
const CI_CHECK_STATES: readonly CiCheckState[] = ["pending", "success", "failure", "error"];

function isCiCheckState(value: unknown): value is CiCheckState {
  return typeof value === "string" && (CI_CHECK_STATES as readonly string[]).includes(value);
}

export interface CiCheck {
  name: string;
  state: CiCheckState;
  requiredForMerge?: boolean;
}

function parseCiCheck(value: unknown, source: string): CiCheck {
  if (
    isRecord(value) &&
    typeof value.name === "string" &&
    isCiCheckState(value.state) &&
    (value.requiredForMerge === undefined || typeof value.requiredForMerge === "boolean")
  ) {
    return value.requiredForMerge === undefined
      ? { name: value.name, state: value.state }
      : { name: value.name, state: value.state, requiredForMerge: value.requiredForMerge };
  }
  throw new Error(`forge fixture "${source}" does not match the CiCheck shape`);
}

export interface CiStatus {
  state: CiCheckState;
  checks: CiCheck[];
}

function parseCiStatus(value: unknown, source: string): CiStatus {
  if (isRecord(value) && isCiCheckState(value.state) && Array.isArray(value.checks)) {
    return {
      state: value.state,
      checks: value.checks.map((c) => parseCiCheck(c, source)),
    };
  }
  throw new Error(`forge fixture "${source}" does not match the CiStatus shape`);
}

export interface RequiredStatusChecks {
  strict: boolean;
  contexts: string[];
}

function parseRequiredStatusChecks(value: unknown, source: string): RequiredStatusChecks {
  if (
    isRecord(value) &&
    typeof value.strict === "boolean" &&
    Array.isArray(value.contexts) &&
    value.contexts.every((c) => typeof c === "string")
  ) {
    return { strict: value.strict, contexts: value.contexts as string[] };
  }
  throw new Error(`forge fixture "${source}" does not match the RequiredStatusChecks shape`);
}

export interface RequiredPullRequestReviews {
  requiredApprovingReviewCount: number;
}

function parseRequiredPullRequestReviews(
  value: unknown,
  source: string,
): RequiredPullRequestReviews {
  if (isRecord(value) && typeof value.requiredApprovingReviewCount === "number") {
    return { requiredApprovingReviewCount: value.requiredApprovingReviewCount };
  }
  throw new Error(`forge fixture "${source}" does not match the RequiredPullRequestReviews shape`);
}

export interface BranchProtection {
  enabled: boolean;
  requiredStatusChecks: RequiredStatusChecks | null;
  requiredPullRequestReviews: RequiredPullRequestReviews | null;
  enforceAdmins: boolean;
}

function parseBranchProtection(value: unknown, source: string): BranchProtection {
  if (
    isRecord(value) &&
    typeof value.enabled === "boolean" &&
    typeof value.enforceAdmins === "boolean" &&
    (value.requiredStatusChecks === null || isRecord(value.requiredStatusChecks)) &&
    (value.requiredPullRequestReviews === null || isRecord(value.requiredPullRequestReviews))
  ) {
    return {
      enabled: value.enabled,
      enforceAdmins: value.enforceAdmins,
      requiredStatusChecks:
        value.requiredStatusChecks === null
          ? null
          : parseRequiredStatusChecks(value.requiredStatusChecks, source),
      requiredPullRequestReviews:
        value.requiredPullRequestReviews === null
          ? null
          : parseRequiredPullRequestReviews(value.requiredPullRequestReviews, source),
    };
  }
  throw new Error(`forge fixture "${source}" does not match the BranchProtection shape`);
}

// ---------------------------------------------------------------------------
// The interface (GH-005 + GH-007 surface)
// ---------------------------------------------------------------------------

export interface ForgeClient {
  /** GH-005: open (or record) a PR for a stream's head branch against a base. */
  openPullRequest(params: OpenPullRequestParams): Promise<PullRequestRef>;

  /** GH-005: read CI status for a ref (branch name or commit sha) into gates. */
  getCiStatus(ref: string): Promise<CiStatus>;

  /**
   * GH-007: current branch protection for `branch`, or `null` if the forge
   * reports none configured (a real GitHub client would map its 404 for
   * "no protection" to `null` here).
   */
  getBranchProtection(branch: string): Promise<BranchProtection | null>;

  /** GH-007: one-click setup — write branch protection for `branch`. */
  setBranchProtection(branch: string, protection: BranchProtection): Promise<void>;
}

// ---------------------------------------------------------------------------
// FixtureForgeClient
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURES_DIR = join(here, "..", "..", "fixtures", "forge");

export interface FixtureForgeClientFiles {
  /** Filename (within the fixtures dir) returned by `openPullRequest`. */
  pullRequest?: string;
  /** Filename (within the fixtures dir) returned by `getCiStatus`. */
  ciStatus?: string;
  /**
   * Filename (within the fixtures dir) returned by `getBranchProtection`.
   * `null` simulates a forge reporting no protection configured at all
   * (distinct from a fixture describing protection that is present but
   * disabled) — `getBranchProtection` then resolves to `null`.
   */
  branchProtection?: string | null;
}

export interface FixtureForgeClientOptions {
  /** Directory fixture filenames are resolved against. Defaults to the
   * package's own `fixtures/forge/`. */
  fixturesDir?: string;
  files?: FixtureForgeClientFiles;
}

const DEFAULT_FILES: Required<FixtureForgeClientFiles> = {
  pullRequest: "pr-open.json",
  ciStatus: "ci-status-success.json",
  branchProtection: "branch-protection-adequate.json",
};

/**
 * Reads canned JSON fixture files rather than making HTTP calls (never a
 * live GitHub API call). Each method returns exactly what its configured
 * fixture file says, parsed and schema-validated — no merging with call
 * parameters, no derived defaults beyond what's documented here.
 *
 * `setBranchProtection` has no real backend to persist to; it records the
 * write in-memory so a subsequent `getBranchProtection` on the same instance
 * reflects it (useful for exercising a "one-click setup" round trip against
 * the fixture double, same as the local-git-remote implementation does for
 * real).
 */
export class FixtureForgeClient implements ForgeClient {
  private readonly fixturesDir: string;
  private readonly files: Required<FixtureForgeClientFiles>;
  private readonly branchProtectionOverrides = new Map<string, BranchProtection>();

  constructor(options: FixtureForgeClientOptions = {}) {
    this.fixturesDir = options.fixturesDir ?? DEFAULT_FIXTURES_DIR;
    this.files = { ...DEFAULT_FILES, ...options.files };
  }

  private async readJsonFixture(filename: string): Promise<unknown> {
    const raw = await readFile(join(this.fixturesDir, filename), "utf8");
    return JSON.parse(raw) as unknown;
  }

  async openPullRequest(_params: OpenPullRequestParams): Promise<PullRequestRef> {
    const data = await this.readJsonFixture(this.files.pullRequest);
    return parsePullRequestRef(data, this.files.pullRequest);
  }

  async getCiStatus(_ref: string): Promise<CiStatus> {
    const data = await this.readJsonFixture(this.files.ciStatus);
    return parseCiStatus(data, this.files.ciStatus);
  }

  async getBranchProtection(branch: string): Promise<BranchProtection | null> {
    const override = this.branchProtectionOverrides.get(branch);
    if (override) return override;
    if (this.files.branchProtection === null) return null;
    const data = await this.readJsonFixture(this.files.branchProtection);
    return parseBranchProtection(data, this.files.branchProtection);
  }

  async setBranchProtection(branch: string, protection: BranchProtection): Promise<void> {
    this.branchProtectionOverrides.set(branch, protection);
  }
}

// ---------------------------------------------------------------------------
// LocalGitRemoteForgeClient
// ---------------------------------------------------------------------------

/**
 * Backed by a real local **bare** git repository acting as "the remote" —
 * for exercising the push/PR-adjacent mechanics that are genuinely git-level
 * rather than forge-API-level. Every method shells out through `runGit`;
 * nothing here is mocked.
 *
 * Method-to-primitive mapping (all real git operations against the bare
 * repo, not an in-memory approximation):
 *
 *   - `openPullRequest` — verifies `headBranch` actually landed on the
 *     remote via `git rev-parse --verify refs/heads/<branch>`, and throws if
 *     it hasn't. This is the "does the PR's head branch actually exist on
 *     the remote" check a real forge would refuse a PR without. A PR number
 *     is assigned from a monotonic counter stored in the bare repo's own
 *     `git config` (`ibuildos.pr-counter`).
 *   - `getCiStatus` / `recordCiStatus` — git has no native CI concept, so
 *     status is attached to a commit via `git notes` (`refs/notes/ibuildos-ci`),
 *     a real git mechanism for hanging metadata off a commit without
 *     rewriting it.
 *   - `getBranchProtection` / `setBranchProtection` — git has no native
 *     branch-protection object either (that's a forge-API concept), so state
 *     is stored under a dedicated `ibuildos.branch-protection.<branch>.*`
 *     namespace in the bare repo's `git config` — a real, persisted git
 *     config file, read back with `git config --get`.
 */
export class LocalGitRemoteForgeClient implements ForgeClient {
  constructor(private readonly bareRepoPath: string) {}

  /** `git init --bare` the given path and return a client bound to it. */
  static async create(bareRepoPath: string): Promise<LocalGitRemoteForgeClient> {
    await mkdir(bareRepoPath, { recursive: true });
    await runGit(["init", "--bare", "-q"], bareRepoPath);
    const client = new LocalGitRemoteForgeClient(bareRepoPath);
    // Identity for the commits `git notes` creates on this remote.
    await runGit(["config", "user.email", "forge-remote@local"], bareRepoPath);
    await runGit(["config", "user.name", "ibuildos-local-forge-remote"], bareRepoPath);
    return client;
  }

  /** Whether `branch` currently exists as a ref on this remote. */
  async branchExists(branch: string): Promise<boolean> {
    return (await this.resolveBranchSha(branch)) !== null;
  }

  async openPullRequest(params: OpenPullRequestParams): Promise<PullRequestRef> {
    const headSha = await this.resolveBranchSha(params.headBranch);
    if (headSha === null) {
      throw new Error(
        `cannot open PR: head branch "${params.headBranch}" does not exist on the remote — push it first`,
      );
    }
    const number = await this.nextPrNumber();
    return {
      number,
      url: `local-forge://${this.bareRepoPath}/pull/${number}`,
      headBranch: params.headBranch,
      baseBranch: params.baseBranch,
      headSha,
      state: "open",
    };
  }

  async getCiStatus(ref: string): Promise<CiStatus> {
    const sha = await this.resolveRefSha(ref);
    if (sha === null) return { state: "pending", checks: [] };
    const note = await this.readNote(sha, "ibuildos-ci");
    if (note === null) return { state: "pending", checks: [] };
    return parseCiStatus(JSON.parse(note), `git notes refs/notes/ibuildos-ci ${sha}`);
  }

  /** Test/setup helper: attach a CI status to a ref via `git notes`. */
  async recordCiStatus(ref: string, status: CiStatus): Promise<void> {
    const sha = await this.resolveRefSha(ref);
    if (sha === null) {
      throw new Error(`cannot record CI status: ref "${ref}" does not resolve on the remote`);
    }
    await this.writeNote(sha, "ibuildos-ci", JSON.stringify(status));
  }

  async getBranchProtection(branch: string): Promise<BranchProtection | null> {
    const enabledRaw = await this.readConfig(`ibuildos.branch-protection.${branch}.enabled`);
    if (enabledRaw === null) return null;

    const contextsRaw = await this.readConfig(`ibuildos.branch-protection.${branch}.contexts`);
    const strictRaw = await this.readConfig(`ibuildos.branch-protection.${branch}.strict`);
    const reviewsRaw = await this.readConfig(
      `ibuildos.branch-protection.${branch}.required-reviews`,
    );
    const enforceAdminsRaw = await this.readConfig(
      `ibuildos.branch-protection.${branch}.enforce-admins`,
    );

    const contexts = contextsRaw === null || contextsRaw === "" ? [] : contextsRaw.split(",");

    return {
      enabled: enabledRaw === "true",
      requiredStatusChecks:
        contextsRaw === null ? null : { strict: strictRaw === "true", contexts },
      requiredPullRequestReviews:
        reviewsRaw === null ? null : { requiredApprovingReviewCount: Number(reviewsRaw) },
      enforceAdmins: enforceAdminsRaw === "true",
    };
  }

  async setBranchProtection(branch: string, protection: BranchProtection): Promise<void> {
    await this.writeConfig(
      `ibuildos.branch-protection.${branch}.enabled`,
      String(protection.enabled),
    );
    await this.writeConfig(
      `ibuildos.branch-protection.${branch}.enforce-admins`,
      String(protection.enforceAdmins),
    );

    if (protection.requiredStatusChecks === null) {
      await this.unsetConfig(`ibuildos.branch-protection.${branch}.contexts`);
      await this.unsetConfig(`ibuildos.branch-protection.${branch}.strict`);
    } else {
      await this.writeConfig(
        `ibuildos.branch-protection.${branch}.contexts`,
        protection.requiredStatusChecks.contexts.join(","),
      );
      await this.writeConfig(
        `ibuildos.branch-protection.${branch}.strict`,
        String(protection.requiredStatusChecks.strict),
      );
    }

    if (protection.requiredPullRequestReviews === null) {
      await this.unsetConfig(`ibuildos.branch-protection.${branch}.required-reviews`);
    } else {
      await this.writeConfig(
        `ibuildos.branch-protection.${branch}.required-reviews`,
        String(protection.requiredPullRequestReviews.requiredApprovingReviewCount),
      );
    }
  }

  // -- git-level primitives -------------------------------------------------

  private async resolveBranchSha(branch: string): Promise<string | null> {
    const result = await runGit(
      ["rev-parse", "--verify", `refs/heads/${branch}`],
      this.bareRepoPath,
      { check: false },
    );
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  private async resolveRefSha(ref: string): Promise<string | null> {
    const direct = await this.resolveBranchSha(ref);
    if (direct !== null) return direct;
    const result = await runGit(["rev-parse", "--verify", ref], this.bareRepoPath, {
      check: false,
    });
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  private async nextPrNumber(): Promise<number> {
    const current = await this.readConfig("ibuildos.pr-counter");
    const next = current === null ? 1 : Number(current) + 1;
    await this.writeConfig("ibuildos.pr-counter", String(next));
    return next;
  }

  private async readConfig(key: string): Promise<string | null> {
    const result = await runGit(["config", "--get", key], this.bareRepoPath, { check: false });
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  private async writeConfig(key: string, value: string): Promise<void> {
    await runGit(["config", key, value], this.bareRepoPath);
  }

  private async unsetConfig(key: string): Promise<void> {
    await runGit(["config", "--unset", key], this.bareRepoPath, { check: false });
  }

  private async readNote(sha: string, notesRef: string): Promise<string | null> {
    const result = await runGit(
      ["notes", "--ref", `refs/notes/${notesRef}`, "show", sha],
      this.bareRepoPath,
      { check: false },
    );
    return result.exitCode === 0 ? result.stdout : null;
  }

  private async writeNote(sha: string, notesRef: string, content: string): Promise<void> {
    await runGit(
      ["notes", "--ref", `refs/notes/${notesRef}`, "add", "-f", "-m", content, sha],
      this.bareRepoPath,
    );
  }
}
