import { parseArgs } from "node:util";
import { loadProfile } from "../bundle/load.js";
import { loadConfig } from "../config.js";
import { resolveProfileDir } from "../profile-path.js";
import { buildInstructionsTemplate } from "../instructions-template.js";
import { EXIT_CLEAN, UsageError } from "../exit-codes.js";
import type { CommandEnv } from "./types.js";

/** `ibuildos instructions <Type> [--profile <dir>] [--format text|json]`
 * (FORMATS §12) — print the authoring template (required frontmatter keys,
 * declared links, required body sections) for a type resolved from the
 * loaded profile. */
export async function runInstructions(args: string[], env: CommandEnv): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      profile: { type: "string" },
      format: { type: "string", default: "text" },
    },
    allowPositionals: true,
    strict: true,
  });

  const typeName = positionals[0];
  if (!typeName) throw new UsageError("instructions requires a <Type> argument, e.g. `ibuildos instructions Story`");
  if (positionals.length > 1) {
    throw new UsageError(`instructions takes exactly one <Type> argument, got ${positionals.length}`);
  }
  if (values.format !== "text" && values.format !== "json") {
    throw new UsageError(`--format must be "text" or "json", got "${values.format}"`);
  }

  const config = loadConfig(env.cwd);
  const profileDir = resolveProfileDir(env.cwd, config, values.profile);
  const profile = loadProfile(profileDir);

  if (!profile.registry.has(typeName)) {
    throw new UsageError(`unknown type "${typeName}" — not defined by any TypeDefinition under ${profileDir}`);
  }

  const resolved = profile.registry.resolve(typeName);
  const template = buildInstructionsTemplate(resolved);

  if (values.format === "json") {
    env.print(JSON.stringify({ type: resolved.name, template }, null, 2) + "\n");
  } else {
    env.print(template + "\n");
  }
  return EXIT_CLEAN;
}
