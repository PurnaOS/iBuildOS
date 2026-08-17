import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { resolveSeverity, type Finding } from "@ibuildos/schemas";
import { GateCompositionError, evaluateGate, expandGate } from "@ibuildos/engine";
import { loadBundle } from "../bundle/load.js";
import { loadConfig } from "../config.js";
import { resolveProfileDir } from "../profile-path.js";
import { buildRuleCheckers, bundleWideFindings } from "../rules/checkers.js";
import { buildReport, formatProfileField, hasBlockingError } from "../findings/report.js";
import { formatText } from "../findings/text.js";
import { pinRefusalFindings } from "../pin-check.js";
import { readEngineVersion } from "../version.js";
import { currentCommitSha } from "../git.js";
import { EXIT_CLEAN, EXIT_ERRORS, EXIT_PIN_MISMATCH, UsageError } from "../exit-codes.js";
import type { CommandEnv } from "./types.js";

/** `ibuildos gate <name> [--commit <sha>] [--format text|json]
 * [--annotate-only]` (FORMATS §12). */
export async function runGate(args: string[], env: CommandEnv): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      commit: { type: "string" },
      format: { type: "string", default: "text" },
      "annotate-only": { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  const gateName = positionals[0];
  if (!gateName) throw new UsageError("gate requires a <name> argument, e.g. `ibuildos gate merge`");
  if (positionals.length > 1) {
    throw new UsageError(`gate takes exactly one <name> argument, got ${positionals.length}`);
  }
  if (values.format !== "text" && values.format !== "json") {
    throw new UsageError(`--format must be "text" or "json", got "${values.format}"`);
  }

  const config = loadConfig(env.cwd);
  const bundleRoot = resolve(env.cwd, config?.bundle.root ?? "docs");
  const profileDir = resolveProfileDir(env.cwd, config, undefined);
  const bundle = loadBundle(bundleRoot, profileDir);
  const engineVersion = readEngineVersion();
  const profileField = formatProfileField(bundle.profile.manifest);
  const commit = values.commit ?? (await currentCommitSha(env.cwd));

  const refusal = pinRefusalFindings(config, engineVersion, bundle.profile.manifest?.version);
  if (refusal.length > 0) {
    const report = buildReport({
      engineVersion,
      profile: profileField,
      commit,
      gate: gateName,
      findings: refusal,
    });
    env.print(values.format === "json" ? JSON.stringify(report, null, 2) + "\n" : formatText(report));
    return EXIT_PIN_MISMATCH;
  }

  if (!bundle.profile.gatesFile) {
    throw new UsageError(`no gates.yaml found under ${bundle.profileDir} — cannot evaluate gate "${gateName}"`);
  }

  let expandedRuleIds: Set<string>;
  let findings: Finding[];
  try {
    const expanded = evaluateGate(gateName, bundle.profile.gatesFile, {
      ruleCheckers: buildRuleCheckers(bundle),
      artifacts: bundle.artifacts,
    });
    findings = expanded;
    // evaluateGate silently skips rule ids with no wired checker (its own
    // documented behavior) — re-derive which ids the gate actually expands
    // to (not just which ones happened to produce a checker+finding) so the
    // bundle-wide rules below only apply if the gate actually includes them.
    expandedRuleIds = new Set(expandGate(gateName, bundle.profile.gatesFile).map((r) => r.ruleId));
  } catch (error) {
    if (error instanceof GateCompositionError) {
      throw new UsageError(error.message);
    }
    throw error;
  }

  const wideFindings = bundleWideFindings(bundle)
    .filter((f) => expandedRuleIds.has(f.rule))
    .map((f) => ({ ...f, severity: resolveSeverity(f.rule, gateName) }));

  const allFindings = [...findings, ...wideFindings];

  const report = buildReport({
    engineVersion,
    profile: profileField,
    commit,
    gate: gateName,
    findings: allFindings,
  });

  env.print(values.format === "json" ? JSON.stringify(report, null, 2) + "\n" : formatText(report));

  if (values["annotate-only"]) return EXIT_CLEAN;
  return hasBlockingError(report) ? EXIT_ERRORS : EXIT_CLEAN;
}
