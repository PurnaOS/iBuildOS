import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixtureForgeClient, LocalGitRemoteForgeClient, type BranchProtection } from "./client.js";
import { checkBranchProtection, GH_BRANCH_PROTECTION_MISSING_RULE } from "./rules.js";

const GATE_CHECK = "ibuildos/gate";

describe("gh/branch-protection-missing (GH-007)", () => {
  it("does not fire when protection is present, enabled, and requires the gate check", async () => {
    const client = new FixtureForgeClient(); // default fixture: adequate
    const findings = await checkBranchProtection(client, {
      branch: "main",
      requiredCheckContext: GATE_CHECK,
    });
    expect(findings).toEqual([]);
  });

  it("fires when no branch protection is configured at all", async () => {
    const client = new FixtureForgeClient({ files: { branchProtection: null } });
    const findings = await checkBranchProtection(client, {
      branch: "main",
      requiredCheckContext: GATE_CHECK,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: GH_BRANCH_PROTECTION_MISSING_RULE,
      severity: "warn",
      artifact: "branch:main",
      subject: "main",
    });
    expect(findings[0]!.message).toMatch(/no branch protection is configured/);
  });

  it("fires when branch protection exists but is disabled", async () => {
    const client = new FixtureForgeClient({
      files: { branchProtection: "branch-protection-disabled.json" },
    });
    const findings = await checkBranchProtection(client, {
      branch: "main",
      requiredCheckContext: GATE_CHECK,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/is disabled/);
  });

  it("fires when protection is enabled but does not require the gate check", async () => {
    const client = new FixtureForgeClient({
      files: { branchProtection: "branch-protection-no-gate-check.json" },
    });
    const findings = await checkBranchProtection(client, {
      branch: "main",
      requiredCheckContext: GATE_CHECK,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/does not require the gate check "ibuildos\/gate"/);
  });

  it("respects a caller-supplied artifact id instead of the branch:<name> default", async () => {
    const client = new FixtureForgeClient({ files: { branchProtection: null } });
    const findings = await checkBranchProtection(client, {
      branch: "main",
      requiredCheckContext: GATE_CHECK,
      artifact: "REPO-0001",
    });
    expect(findings[0]!.artifact).toBe("REPO-0001");
  });

  it("works unchanged against LocalGitRemoteForgeClient — fires before setup, silent after", async () => {
    const root = await mkdtemp(join(tmpdir(), "ibuildos-forge-rule-"));
    try {
      const bareDir = join(root, "remote.git");
      const client = await LocalGitRemoteForgeClient.create(bareDir);

      const before = await checkBranchProtection(client, {
        branch: "main",
        requiredCheckContext: GATE_CHECK,
      });
      expect(before).toHaveLength(1);
      expect(before[0]!.rule).toBe(GH_BRANCH_PROTECTION_MISSING_RULE);

      const adequate: BranchProtection = {
        enabled: true,
        requiredStatusChecks: { strict: true, contexts: [GATE_CHECK] },
        requiredPullRequestReviews: { requiredApprovingReviewCount: 1 },
        enforceAdmins: true,
      };
      await client.setBranchProtection("main", adequate);

      const after = await checkBranchProtection(client, {
        branch: "main",
        requiredCheckContext: GATE_CHECK,
      });
      expect(after).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fires again against LocalGitRemoteForgeClient once protection is disabled after being adequate", async () => {
    const root = await mkdtemp(join(tmpdir(), "ibuildos-forge-rule-"));
    try {
      const bareDir = join(root, "remote.git");
      const client = await LocalGitRemoteForgeClient.create(bareDir);

      await client.setBranchProtection("main", {
        enabled: true,
        requiredStatusChecks: { strict: true, contexts: [GATE_CHECK] },
        requiredPullRequestReviews: null,
        enforceAdmins: false,
      });
      expect(
        await checkBranchProtection(client, { branch: "main", requiredCheckContext: GATE_CHECK }),
      ).toEqual([]);

      await client.setBranchProtection("main", {
        enabled: false,
        requiredStatusChecks: null,
        requiredPullRequestReviews: null,
        enforceAdmins: false,
      });
      const findings = await checkBranchProtection(client, {
        branch: "main",
        requiredCheckContext: GATE_CHECK,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.message).toMatch(/is disabled/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
