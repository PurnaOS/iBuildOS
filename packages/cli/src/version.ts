import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The CLI is a thin, same-monorepo consumer of @ibuildos/engine (TECH-STACK T-009):
// there is no npm-installed copy to introspect, so "the actual evaluator version"
// for `pin/engine` (FORMATS §6 VG-012) is read straight off the workspace sibling
// package's own package.json — the same monorepo-relative-path convention
// packages/engine/src/test-utils/fixtures.ts uses for its fixtures root.

const here = dirname(fileURLToPath(import.meta.url));

interface PackageJson {
  version: string;
}

function readPackageVersion(relativePathFromSrc: string): string {
  const raw = readFileSync(join(here, relativePathFromSrc), "utf8");
  return (JSON.parse(raw) as PackageJson).version;
}

/** The running engine's version — what `pin/engine` (VG-012) compares the
 * project's recorded `engine` semver range against. */
export function readEngineVersion(): string {
  return readPackageVersion(join("..", "..", "engine", "package.json"));
}

/** The CLI's own version (reported in `--version` and diagnostic output). */
export function readCliVersion(): string {
  return readPackageVersion(join("..", "package.json"));
}
