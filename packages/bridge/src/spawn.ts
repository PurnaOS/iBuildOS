import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

// Test-support only: locates and spawns this package's own `tsx`-run
// scenario driver, or the shipped `@ibuildos/stub-agent` CLI, as real child
// processes. Resolves everything from `import.meta.url`/`require.resolve`
// rather than `process.cwd()` — vitest's cwd isn't guaranteed to be this
// package's root (advisor guidance carried over from orientation).

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, ".."); // src/ -> package root
const require = createRequire(import.meta.url);

export function resolveTsxBin(): string {
  return join(packageRoot, "node_modules", ".bin", "tsx");
}

export function resolveRunScenarioEntry(): string {
  return join(here, "run-scenario.ts");
}

export function resolveStubAgentCliEntry(): string {
  const pkgJsonPath = require.resolve("@ibuildos/stub-agent/package.json");
  return join(dirname(pkgJsonPath), "src", "cli.ts");
}

export function resolveFixture(name: string): string {
  return join(packageRoot, "fixtures", name);
}

function spawnTsx(scriptPath: string, args: string[]): ChildProcessWithoutNullStreams {
  return spawn(resolveTsxBin(), [scriptPath, ...args], {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** Spawn this package's own scenario driver against one of `fixtures/*.json`. */
export function spawnOwnScenario(fixtureName: string): ChildProcessWithoutNullStreams {
  return spawnTsx(resolveRunScenarioEntry(), [resolveFixture(fixtureName)]);
}

/** Spawn the shipped stub-agent CLI against one of its own built-in scenarios by name. */
export function spawnStubAgentScenario(scenarioName: string): ChildProcessWithoutNullStreams {
  return spawnTsx(resolveStubAgentCliEntry(), [scenarioName]);
}
