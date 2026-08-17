import { parseArgs } from "node:util";
import { expandGate } from "@ibuildos/engine";
import { loadProfile } from "../bundle/load.js";
import { loadConfig } from "../config.js";
import { resolveProfileDir } from "../profile-path.js";
import { EXIT_CLEAN, UsageError } from "../exit-codes.js";
import type { CommandEnv } from "./types.js";

/** `ibuildos gates [--profile <dir>] [--format text|json]` — list the named
 * gate compositions from `docs/profile/gates.yaml` (FORMATS §6). */
export async function runGates(args: string[], env: CommandEnv): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      profile: { type: "string" },
      format: { type: "string", default: "text" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (values.format !== "text" && values.format !== "json") {
    throw new UsageError(`--format must be "text" or "json", got "${values.format}"`);
  }

  const config = loadConfig(env.cwd);
  const profileDir = resolveProfileDir(env.cwd, config, values.profile);
  const profile = loadProfile(profileDir);
  if (!profile.gatesFile) {
    throw new UsageError(`no gates.yaml found under ${profileDir}`);
  }
  const gatesFile = profile.gatesFile;

  const names = Object.keys(gatesFile.gates).sort();
  const rows = names.map((name) => ({
    name,
    entries: gatesFile.gates[name]!,
    expanded: expandGate(name, gatesFile).map((r) => r.ruleId),
  }));

  if (values.format === "json") {
    env.print(JSON.stringify(rows, null, 2) + "\n");
    return EXIT_CLEAN;
  }

  for (const row of rows) {
    env.print(`${row.name}\n`);
    env.print(`  composed of: ${row.entries.join(", ")}\n`);
    env.print(`  expands to ${row.expanded.length} rule(s): ${row.expanded.join(", ")}\n`);
  }
  return EXIT_CLEAN;
}
