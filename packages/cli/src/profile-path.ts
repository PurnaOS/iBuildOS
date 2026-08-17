import { resolve } from "node:path";
import type { IBuildOSConfig } from "@ibuildos/schemas";

/** Default profile directory: `ibuildos.yaml`'s `profile.path` if declared
 * (FORMATS §7), else `<cwd>/docs/profile` (FORMATS §3's default layout). */
export function resolveProfileDir(
  cwd: string,
  config: IBuildOSConfig | undefined,
  explicit: string | undefined,
): string {
  if (explicit) return resolve(cwd, explicit);
  if (config?.profile.path) return resolve(cwd, config.profile.path);
  return resolve(cwd, "docs", "profile");
}
