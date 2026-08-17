import { resolveSeverity, type Finding } from "@ibuildos/schemas";
import type { ForgeClient } from "./client.js";

// SPEC.md GH-007 — "Where the connected forge supports it, the app shall
// offer one-click setup and ongoing verification of branch protection
// requiring the gate check (VG-010) on trunk … Missing or disabled
// protection is surfaced as a finding, never silently."
//
// Rule id `gh/branch-protection-missing` is NOT present in FORMATS.md §6's
// rule table (the forge area has no rows there yet) — invented for this
// work package and appended to RULE_REGISTRY (packages/schemas/src/
// rule-registry.ts) per that file's "rule IDs frozen, new rules append"
// convention. Default severity "warn", matching the registry's own
// documented fallback for a rule FORMATS doesn't state a severity for.
//
// Unlike the artifact-oriented rule modules elsewhere in packages/engine/src
// /rules/, this checker is intentionally I/O-bound: "verify branch
// protection" is inherently a live read against the forge. The dependency
// injection boundary is the `ForgeClient` interface — this function is
// written against the interface only, so it runs unchanged against
// `FixtureForgeClient`, `LocalGitRemoteForgeClient`, or a future real
// GitHub-backed client.

export const GH_BRANCH_PROTECTION_MISSING_RULE = "gh/branch-protection-missing";

export interface CheckBranchProtectionOptions {
  /** The trunk branch GH-007's protection requirement applies to (e.g. "main"). */
  branch: string;
  /** The gate check's required-status-check context name (VG-010's check, e.g. "ibuildos/gate"). */
  requiredCheckContext: string;
  /** Finding.artifact — defaults to `branch:<branch>` since this isn't a per-OKF-artifact check. */
  artifact?: string;
}

/**
 * GH-007: fetch `branch`'s protection from `client` and fire a single
 * `gh/branch-protection-missing` finding if it is inadequate — inadequate
 * meaning any of:
 *
 *   1. no protection configured at all (`getBranchProtection` → `null`)
 *   2. protection configured but `enabled: false`
 *   3. protection enabled but its required status checks don't include
 *      `requiredCheckContext` (the gate check, VG-010) — protection that
 *      exists but doesn't actually enforce the gate is exactly as unsafe as
 *      no protection, for the purpose this requirement backstops (D-113's
 *      no-authorization stance relying on remote enforcement)
 *
 * Returns `[]` when protection is present, enabled, and requires the gate
 * check — nothing else about the protection configuration is this rule's
 * concern.
 */
export async function checkBranchProtection(
  client: ForgeClient,
  options: CheckBranchProtectionOptions,
): Promise<Finding[]> {
  const { branch, requiredCheckContext } = options;
  const artifact = options.artifact ?? `branch:${branch}`;
  const protection = await client.getBranchProtection(branch);

  const reasons: string[] = [];
  if (protection === null) {
    reasons.push(`no branch protection is configured for trunk branch "${branch}"`);
  } else if (!protection.enabled) {
    reasons.push(`branch protection for "${branch}" is disabled`);
  } else {
    const contexts = protection.requiredStatusChecks?.contexts ?? [];
    if (!contexts.includes(requiredCheckContext)) {
      reasons.push(
        `branch protection for "${branch}" does not require the gate check "${requiredCheckContext}" (VG-010) — required contexts: [${contexts.join(", ")}]`,
      );
    }
  }

  if (reasons.length === 0) return [];

  return [
    {
      rule: GH_BRANCH_PROTECTION_MISSING_RULE,
      severity: resolveSeverity(GH_BRANCH_PROTECTION_MISSING_RULE),
      artifact,
      subject: branch,
      message: `GH-007: ${reasons.join("; ")}.`,
    },
  ];
}
