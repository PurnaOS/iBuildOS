import { parseArgs } from "node:util";
import { RULE_REGISTRY } from "@ibuildos/schemas";
import { WIRED_PER_ARTIFACT_RULES, WIRED_BUNDLE_WIDE_RULES } from "../rules/checkers.js";
import { EXIT_CLEAN, UsageError } from "../exit-codes.js";
import type { CommandEnv } from "./types.js";

/** `ibuildos rules` — list the canonical rule registry (FORMATS §6),
 * flagging which ones this CLI actually evaluates ("wired") vs. which are
 * defined but not yet checkable from a headless bundle load ("unwired"). */
export async function runRules(args: string[], env: CommandEnv): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { format: { type: "string", default: "text" } },
    allowPositionals: false,
    strict: true,
  });
  if (values.format !== "text" && values.format !== "json") {
    throw new UsageError(`--format must be "text" or "json", got "${values.format}"`);
  }

  const wired = new Set<string>([...WIRED_PER_ARTIFACT_RULES, ...WIRED_BUNDLE_WIDE_RULES, "pin/engine", "pin/profile"]);
  const ids = Object.keys(RULE_REGISTRY).sort();

  if (values.format === "json") {
    env.print(
      JSON.stringify(
        ids.map((id) => ({ ...RULE_REGISTRY[id], wired: wired.has(id) })),
        null,
        2,
      ) + "\n",
    );
    return EXIT_CLEAN;
  }

  for (const id of ids) {
    const meta = RULE_REGISTRY[id]!;
    const overrides = meta.overrides
      ? ` (${Object.entries(meta.overrides).map(([k, v]) => `${k}:${v}`).join(", ")})`
      : "";
    env.print(`${wired.has(id) ? "* " : "  "}${id.padEnd(28)} ${meta.defaultSeverity}${overrides}\n`);
  }
  env.print(`\n* = evaluated by this CLI; others are defined but not yet wired to a checker\n`);
  return EXIT_CLEAN;
}
