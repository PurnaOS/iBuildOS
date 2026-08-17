import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadBaseline, serializeBaseline } from "@ibuildos/engine";
import type { Baseline } from "@ibuildos/schemas";

/** FORMATS §8: `.ibuildos/baseline.json`, committed at the repo root — same
 * `cwd`-is-project-root convention `config.ts` uses for `ibuildos.yaml`. */
export function baselinePathFor(cwd: string): string {
  return join(cwd, ".ibuildos", "baseline.json");
}

export function readBaselineIfPresent(cwd: string): Baseline | undefined {
  const path = baselinePathFor(cwd);
  if (!existsSync(path)) return undefined;
  return loadBaseline(readFileSync(path, "utf8"));
}

export function writeBaselineFile(cwd: string, baseline: Baseline): string {
  const path = baselinePathFor(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeBaseline(baseline) + "\n", "utf8");
  return path;
}
