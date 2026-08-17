import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SecretStore } from "../src/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// This package's own root — where `node_modules/tsx` actually resolves
// from. Spawning `node --import tsx/esm <stub-agent cli.ts>` with a fresh
// temp dir as `cwd` fails with `ERR_MODULE_NOT_FOUND: tsx` (verified
// empirically): `--import`'s bare-specifier resolution walks up from `cwd`,
// and a `mkdtempSync(os.tmpdir())` directory has no `node_modules` in its
// ancestry at all. The worktree scope (fs/terminal) and the spawn `cwd` are
// independent parameters on `spawnCommandAgent` — this constant is only for
// the latter.
export const PACKAGE_ROOT = join(HERE, "..");

// Relative path, not package-name resolution: packages/stub-agent's
// package.json declares no "exports" field, so a subpath import would
// normally resolve fine too, but a plain relative path inside this
// monorepo's fixed layout has zero dependence on pnpm workspace linking or
// resolution-algorithm details — nothing here should be a source of flake.
export const STUB_AGENT_CLI = join(HERE, "..", "..", "stub-agent", "src", "cli.ts");

export function fixturePath(name: string): string {
  return join(HERE, "fixtures", name);
}

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `ibuildos-acp-${prefix}-`));
}

/** Polls `check` until it returns truthy or `timeoutMs` elapses, throwing on
 * timeout. Used instead of a blind `setTimeout` where a test needs to wait
 * on the raw-frame tap (spawn.ts) to catch up with the ACP SDK's own,
 * separately-buffered read path — both are fed by the same child stdout,
 * but each hop is async, so there's no single await that guarantees both
 * have drained by the same tick. */
export async function waitFor(check: () => boolean, timeoutMs = 2000, intervalMs = 10): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (check()) return;
    if (Date.now() >= deadline) throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** A minimal, structurally-compatible test double for this package's
 * `SecretStore` seam (types.ts) — deliberately not an import of
 * packages/engine's real `FakeSecretStore`: that package's package.json
 * `"exports"` field only publishes its `"."` entry, so a cross-package
 * subpath import of `secrets/secret-store.js` isn't a reliable resolution
 * path from here, and this package's own `SecretStore` interface (types.ts)
 * is intentionally structural so it never has to import engine at all. The
 * shape is identical to `packages/engine/src/secrets/secret-store.ts`'s
 * `FakeSecretStore` on purpose. */
export class FakeSecretStore implements SecretStore {
  constructor(private readonly seed: Record<string, string> = {}) {}

  async get(name: string): Promise<string | undefined> {
    return this.seed[name];
  }

  async request(name: string, reason?: string): Promise<string> {
    const value = this.seed[name];
    if (value === undefined) {
      throw new Error(`FakeSecretStore: no seeded value for "${name}"${reason ? ` (${reason})` : ""}`);
    }
    return value;
  }
}

/** A deterministic clock for BD-016 tests: `wait` resolves immediately
 * (no real sleeping) but every call is recorded so a test can assert on
 * the *computed* delays without spending real wall-clock time on them.
 * `random` is fixed (no jitter) unless a test overrides it. */
export function makeFakeClock(startAt = 0) {
  let now = startAt;
  const waits: number[] = [];
  return {
    clock: {
      now: () => now,
      wait: async (ms: number) => {
        waits.push(ms);
        now += ms; // advance simulated time so escalation math is exercisable
      },
      random: () => 0.5, // midpoint: zero jitter
    },
    waits,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
