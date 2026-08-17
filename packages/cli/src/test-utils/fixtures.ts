import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "..", "..", "test", "fixtures");

/** Absolute path to one of `packages/cli/test/fixtures/<name>` — this
 * package's own self-contained bundle fixtures (mirrors
 * packages/engine/src/test-utils/fixtures.ts's convention). */
export function fixturePath(name: string): string {
  return join(fixturesRoot, name);
}

/** Absolute path to the real repo root — two levels up from
 * `packages/cli/src`. Used by tests that deliberately exercise the CLI
 * against the real shipped `docs/profile/` (rules/gates/instructions are
 * genuinely exercised by the real 27-type profile; `validate` is not — see
 * the CLI's gap-list note on why `docs/requirements/` is unsuitable). */
export function repoRoot(): string {
  return join(here, "..", "..", "..", "..");
}

/** Copy a fixture into a fresh OS temp directory and return its path — for
 * tests that write (baseline write, a future scoped-validate run), so they
 * never mutate the committed fixture in place. */
export function copyFixtureToTemp(name: string): string {
  const dest = mkdtempSync(join(tmpdir(), `ibuildos-cli-${name}-`));
  cpSync(fixturePath(name), dest, { recursive: true });
  return dest;
}
