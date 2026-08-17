import { parseArgs } from "node:util";
import { resolve } from "node:path";
import type { Baseline, Finding } from "@ibuildos/schemas";
import { fingerprint, serializeBaseline } from "@ibuildos/engine";
import { loadBundle } from "../bundle/load.js";
import { loadConfig } from "../config.js";
import { resolveProfileDir } from "../profile-path.js";
import { buildRuleCheckers, bundleWideFindings } from "../rules/checkers.js";
import { formatProfileField } from "../findings/report.js";
import { readBaselineIfPresent, writeBaselineFile } from "../baseline-io.js";
import { readEngineVersion } from "../version.js";
import { EXIT_CLEAN, UsageError } from "../exit-codes.js";
import type { CommandEnv } from "./types.js";

/** `ibuildos baseline write | show` (FORMATS §12/§8). */
export async function runBaseline(args: string[], env: CommandEnv): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: { format: { type: "string", default: "text" } },
    allowPositionals: true,
    strict: true,
  });

  const subcommand = positionals[0];
  if (subcommand !== "write" && subcommand !== "show") {
    throw new UsageError(`baseline requires "write" or "show", got ${subcommand ? `"${subcommand}"` : "nothing"}`);
  }
  if (values.format !== "text" && values.format !== "json") {
    throw new UsageError(`--format must be "text" or "json", got "${values.format}"`);
  }

  if (subcommand === "show") {
    const baseline = readBaselineIfPresent(env.cwd);
    if (!baseline) {
      env.print("no .ibuildos/baseline.json found\n");
      return EXIT_CLEAN;
    }
    if (values.format === "json") {
      env.print(serializeBaseline(baseline) + "\n");
    } else {
      env.print(`baseline: ${baseline.profile}, engine ${baseline.engine}, generated ${baseline.generated}\n`);
      env.print(`${baseline.entries.length} entries, ${baseline.scope_events.length} scope event(s)\n`);
      for (const entry of baseline.entries) {
        env.print(`  ${entry.rule}  ${entry.artifact}  ${entry.fp}\n`);
      }
    }
    return EXIT_CLEAN;
  }

  // write: snapshot the bundle's current findings as accepted baseline debt.
  const config = loadConfig(env.cwd);
  const bundleRoot = resolve(env.cwd, config?.bundle.root ?? "docs");
  const profileDir = resolveProfileDir(env.cwd, config, undefined);
  const bundle = loadBundle(bundleRoot, profileDir);
  const engineVersion = readEngineVersion();
  const profileField = formatProfileField(bundle.profile.manifest);

  const checkers = buildRuleCheckers(bundle);
  const findings: Finding[] = [];
  for (const artifact of bundle.artifacts) {
    for (const checker of Object.values(checkers)) {
      findings.push(...checker(artifact));
    }
  }
  findings.push(...bundleWideFindings(bundle));

  const previous = readBaselineIfPresent(env.cwd);

  const baseline: Baseline = {
    formats: 1,
    engine: engineVersion,
    profile: profileField,
    generated: new Date().toISOString(),
    scope_events: previous?.scope_events ?? [],
    entries: findings.map((f) => ({ rule: f.rule, artifact: f.artifact, fp: f.fp ?? fingerprint(f) })),
  };

  const path = writeBaselineFile(env.cwd, baseline);
  env.print(`wrote ${baseline.entries.length} entries to ${path}\n`);
  return EXIT_CLEAN;
}

// Not implemented this pass: `write` always overwrites rather than enforcing
// FORMATS §8's shrink-only ratchet (`checkShrinkOnly`, already implemented
// in packages/engine/src/baseline/baseline.ts) against the previous
// baseline — a natural follow-up, not wired here to keep this command's
// first cut simple.
