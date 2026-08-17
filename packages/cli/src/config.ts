import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { IBuildOSConfigSchema, type IBuildOSConfig } from "@ibuildos/schemas";
import { UsageError } from "./exit-codes.js";

/**
 * `ibuildos.yaml` (FORMATS §7) — "one file at repo root." This is a
 * convention, not a search-upward-through-ancestors resolver: `cwd` is
 * treated as the project root directly (every fixture and every real
 * invocation of this CLI runs from there), the same way `bundle.root`
 * defaults to `docs` under it.
 */
export function configPathFor(cwd: string): string {
  return join(cwd, "ibuildos.yaml");
}

/** Load and validate `ibuildos.yaml` at `cwd`, or `undefined` when no such
 * file exists — absent config is a legitimate state (a bare artifact bundle
 * with no project-level pin declared), not a usage error. */
export function loadConfig(cwd: string): IBuildOSConfig | undefined {
  const path = configPathFor(cwd);
  if (!existsSync(path)) return undefined;

  const raw = readFileSync(path, "utf8");
  const parsed = IBuildOSConfigSchema.safeParse(parseYaml(raw));
  if (!parsed.success) {
    throw new UsageError(
      `${path} does not conform to schema: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}
