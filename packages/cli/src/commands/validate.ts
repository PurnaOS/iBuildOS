import { parseArgs } from "node:util";
import { resolve } from "node:path";
import type { Finding } from "@ibuildos/schemas";
import { loadBundle } from "../bundle/load.js";
import { loadConfig } from "../config.js";
import { resolveProfileDir } from "../profile-path.js";
import { buildRuleCheckers, bundleWideFindings } from "../rules/checkers.js";
import { buildReport, formatProfileField, hasBlockingError } from "../findings/report.js";
import { formatText } from "../findings/text.js";
import { readBaselineIfPresent } from "../baseline-io.js";
import { pinRefusalFindings } from "../pin-check.js";
import { readEngineVersion } from "../version.js";
import { currentCommitSha, changedFiles } from "../git.js";
import { EXIT_CLEAN, EXIT_ERRORS, EXIT_PIN_MISMATCH, UsageError } from "../exit-codes.js";
import type { CommandEnv } from "./types.js";

/** `ibuildos validate [path] [--changed | --base <ref>] [--baseline]
 * [--format text|json] [--annotate-only]` (FORMATS §12). */
export async function runValidate(args: string[], env: CommandEnv): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      changed: { type: "boolean", default: false },
      base: { type: "string" },
      baseline: { type: "boolean", default: false },
      format: { type: "string", default: "text" },
      "annotate-only": { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.changed && values.base !== undefined) {
    throw new UsageError("--changed and --base <ref> are mutually exclusive");
  }
  if (values.format !== "text" && values.format !== "json") {
    throw new UsageError(`--format must be "text" or "json", got "${values.format}"`);
  }
  if (positionals.length > 1) {
    throw new UsageError(`validate takes at most one path argument, got ${positionals.length}`);
  }

  const config = loadConfig(env.cwd);
  // The explicit `path` positional overrides the *artifact* bundle root
  // only (so `validate docs/stories` scopes which files get walked) — the
  // type profile always resolves independently via `resolveProfileDir`
  // (ibuildos.yaml's `profile.path`, else `<cwd>/docs/profile`), never as
  // `<path>/profile`. Passing `bundleRoot` itself through as the default
  // would silently look for e.g. `docs/stories/profile`, find nothing, and
  // make every type-driven rule report a false "0 errors" for the subtree.
  const bundleRoot = resolve(env.cwd, positionals[0] ?? config?.bundle.root ?? "docs");
  const profileDir = resolveProfileDir(env.cwd, config, undefined);
  const bundle = loadBundle(bundleRoot, profileDir);
  const engineVersion = readEngineVersion();
  const profileField = formatProfileField(bundle.profile.manifest);
  const commit = await currentCommitSha(env.cwd);

  // Pre-flight refusal (VG-012): checked before any rule runs, and NOT
  // subject to --annotate-only — that flag forces exit 0 on *findings*
  // (FORMATS §12); a pin mismatch is a refusal, not a finding, so annotate-
  // only must not silently paper over it.
  const refusal = pinRefusalFindings(config, engineVersion, bundle.profile.manifest?.version);
  if (refusal.length > 0) {
    const report = buildReport({
      engineVersion,
      profile: profileField,
      commit,
      gate: "",
      findings: refusal,
    });
    env.print(values.format === "json" ? JSON.stringify(report, null, 2) + "\n" : formatText(report));
    return EXIT_PIN_MISMATCH;
  }

  // --changed / --base <ref>: scope the reported findings to artifacts
  // whose source file actually changed. The full bundle is still loaded
  // (every artifact, unscoped) so cross-artifact rules (link/target-exists,
  // link/cycles, …) see the whole graph — only which findings get *reported*
  // is scoped, not what the graph knows about.
  let scopeIds: Set<string> | undefined;
  if (values.changed || values.base !== undefined) {
    const changed = await changedFiles(env.cwd, values.base);
    const changedAbsolute = new Set(changed.map((f) => resolve(env.cwd, f)));
    scopeIds = new Set(
      bundle.artifacts.filter((a) => changedAbsolute.has(a.filePath)).map((a) => a.id),
    );
  }

  const checkers = buildRuleCheckers(bundle);
  let findings: Finding[] = [];
  for (const artifact of bundle.artifacts) {
    for (const checker of Object.values(checkers)) {
      findings.push(...checker(artifact));
    }
  }
  findings.push(...bundleWideFindings(bundle));

  if (scopeIds) {
    const scope = scopeIds;
    findings = findings.filter((f) => scope.has(f.artifact));
  }

  const baseline = values.baseline ? readBaselineIfPresent(env.cwd) : undefined;

  const report = buildReport({
    engineVersion,
    profile: profileField,
    commit,
    gate: "",
    findings,
    ...(baseline ? { baseline } : {}),
  });

  env.print(values.format === "json" ? JSON.stringify(report, null, 2) + "\n" : formatText(report));

  if (values["annotate-only"]) return EXIT_CLEAN;
  return hasBlockingError(report) ? EXIT_ERRORS : EXIT_CLEAN;
}
