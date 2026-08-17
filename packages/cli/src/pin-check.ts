import { checkEnginePin, checkProfilePin } from "@ibuildos/engine";
import type { Finding, IBuildOSConfig } from "@ibuildos/schemas";

/**
 * FORMATS §12 exit code 3 — "engine/profile pin mismatch (refusal, VG-012)".
 * This is a *refusal*, distinct from an ordinary error-severity finding: the
 * caller is expected to skip running the rest of the bundle's rules entirely
 * when this returns anything non-empty, not fold it into the normal findings
 * count.
 *
 * `context: "ci"` is passed explicitly — `RULE_REGISTRY` has both pin rules
 * at `defaultSeverity: "warn"` with `{ ci: "error", ui: "warn" }`; with no
 * context threaded through, `resolveSeverity` would return `"warn"` and a
 * plain severity->exit-code mapping would never reach exit 3. This CLI *is*
 * the CI surface (TECH-STACK T-009), so `"ci"` is the correct context here,
 * independent of whatever context the rest of a `gate <name>` run uses.
 *
 * No `ibuildos.yaml` present means no pin was declared — that's "nothing to
 * check," not a mismatch, so this returns `[]` rather than refusing.
 */
export function pinRefusalFindings(
  config: IBuildOSConfig | undefined,
  engineVersion: string,
  profileVersion: string | undefined,
): Finding[] {
  if (!config) return [];

  const findings: Finding[] = [
    ...checkEnginePin("ibuildos.yaml", config.engine, engineVersion, "ci"),
  ];

  if (profileVersion !== undefined) {
    findings.push(
      ...checkProfilePin("ibuildos.yaml", config.profile.version, profileVersion, "ci"),
    );
  }

  return findings;
}
