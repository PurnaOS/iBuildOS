import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { FakeSecretStore } from "../secrets/secret-store.js";
import { computeContractHash } from "../rules/contract.js";
import {
  ContractRunner,
  ContractTrustDeniedError,
  type ManagedDevProcess,
  type TrustContext,
} from "./runner.js";

// No mocking of execa anywhere in this file: this module's whole job is real
// process management, so a mocked test would prove nothing (see the task
// brief). Every test spawns real `node` subprocesses against synthetic
// scripts written into a real temp directory.

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000, intervalMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // Transient errors (e.g. a file not written yet) count as "not ready" —
    // only a timeout is a real failure.
    const ready = await Promise.resolve()
      .then(predicate)
      .catch(() => false);
    if (ready) return;
    if (Date.now() >= deadline) throw new Error(`waitUntil: condition not met within ${timeoutMs}ms`);
    await wait(intervalMs);
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("could not determine free port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

const noContract = { components: {} };
function trustedContext(overrides: Partial<TrustContext> = {}): TrustContext {
  return {
    contract: noContract,
    trustedHash: computeContractHash(noContract),
    artifactId: "project:test",
    ...overrides,
  };
}

describe("ContractRunner", () => {
  let dir: string;
  let runner: ContractRunner;
  let devProcesses: ManagedDevProcess[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ibuildos-contract-runner-"));
    devProcesses = [];
    runner = new ContractRunner({
      secretStore: new FakeSecretStore({ SECRET_ONE: "s3cr3t-value" }),
      confirmTrust: async () => true,
    });
  });

  afterEach(async () => {
    await Promise.all(devProcesses.map((p) => p.stop().catch(() => {})));
    await rm(dir, { recursive: true, force: true });
  });

  async function writeScript(name: string, content: string): Promise<string> {
    const scriptPath = join(dir, name);
    await writeFile(scriptPath, content, "utf8");
    return scriptPath;
  }

  // ---------------------------------------------------------------------
  // Basic spawn + capture (one-shot commands: test/lint/seed/migrate/build)
  // ---------------------------------------------------------------------

  it("spawns a command via execa argv arrays and captures stdout + exit code", async () => {
    const script = await writeScript(
      "echo.js",
      `console.log("hello-from-child"); process.exit(0);`,
    );

    const result = await runner.runCommand({
      trust: trustedContext(),
      argv: [process.execPath, script],
      cwd: dir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello-from-child");
    expect(result.timedOut).toBe(false);
  });

  it("captures a non-zero exit code and stderr without throwing", async () => {
    const script = await writeScript(
      "fail.js",
      `console.error("boom"); process.exit(7);`,
    );

    const result = await runner.runCommand({
      trust: trustedContext(),
      argv: [process.execPath, script],
      cwd: dir,
    });

    expect(result.exitCode).toBe(7);
    expect(result.stderr.trim()).toBe("boom");
  });

  // ---------------------------------------------------------------------
  // TOFU trust gate (TP-008)
  // ---------------------------------------------------------------------

  describe("contract trust gate", () => {
    it("blocks execution on a hash mismatch until confirmTrust() resolves true", async () => {
      const script = await writeScript(
        "write-marker.js",
        `require("node:fs").writeFileSync(require("node:path").join(process.argv[2], "ran.marker"), "1");`,
      );
      const markerPath = join(dir, "ran.marker");

      let allow = false;
      let confirmCalls = 0;
      const gatedRunner = new ContractRunner({
        secretStore: new FakeSecretStore(),
        confirmTrust: async () => {
          confirmCalls += 1;
          return allow;
        },
      });

      const mismatchedTrust: TrustContext = {
        contract: noContract,
        trustedHash: "not-the-real-hash",
        artifactId: "project:test",
      };

      // 1. confirmTrust() declines -> command never spawns.
      await expect(
        gatedRunner.runCommand({ trust: mismatchedTrust, argv: [process.execPath, script, dir], cwd: dir }),
      ).rejects.toThrow(ContractTrustDeniedError);
      expect(confirmCalls).toBe(1);
      expect(existsSync(markerPath)).toBe(false);

      // 2. confirmTrust() now approves -> command proceeds.
      allow = true;
      const result = await gatedRunner.runCommand({
        trust: mismatchedTrust,
        argv: [process.execPath, script, dir],
        cwd: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(confirmCalls).toBe(2);
      expect(existsSync(markerPath)).toBe(true);
    });

    it("never calls confirmTrust() when the supplied hash already matches", async () => {
      const script = await writeScript("noop.js", `process.exit(0);`);
      let confirmCalls = 0;
      const matchedRunner = new ContractRunner({
        secretStore: new FakeSecretStore(),
        confirmTrust: async () => {
          confirmCalls += 1;
          return true;
        },
      });

      const result = await matchedRunner.runCommand({
        trust: trustedContext(),
        argv: [process.execPath, script],
        cwd: dir,
      });

      expect(result.exitCode).toBe(0);
      expect(confirmCalls).toBe(0);
    });
  });

  // ---------------------------------------------------------------------
  // Env resolution: SecretStore injection, never process.env passthrough
  // ---------------------------------------------------------------------

  it("resolves non-secret vars from config and secret vars from the injected SecretStore, without leaking process.env", async () => {
    const script = await writeScript(
      "print-env.js",
      `console.log(JSON.stringify({
        FOO: process.env.FOO ?? null,
        SECRET_ONE: process.env.SECRET_ONE ?? null,
        hasLeak: Object.prototype.hasOwnProperty.call(process.env, "IBUILDOS_TEST_LEAK_MARKER"),
        hasPath: typeof process.env.PATH === "string" && process.env.PATH.length > 0,
      }));`,
    );

    const previous = process.env.IBUILDOS_TEST_LEAK_MARKER;
    process.env.IBUILDOS_TEST_LEAK_MARKER = "should-not-cross-into-child";
    try {
      const result = await runner.runCommand({
        trust: trustedContext(),
        argv: [process.execPath, script],
        cwd: dir,
        environment: { vars: { FOO: "bar" }, secrets: ["SECRET_ONE"] },
      });

      const parsed = JSON.parse(result.stdout.trim()) as {
        FOO: string | null;
        SECRET_ONE: string | null;
        hasLeak: boolean;
        hasPath: boolean;
      };
      expect(parsed.FOO).toBe("bar");
      expect(parsed.SECRET_ONE).toBe("s3cr3t-value");
      expect(parsed.hasLeak).toBe(false);
      expect(parsed.hasPath).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.IBUILDOS_TEST_LEAK_MARKER;
      else process.env.IBUILDOS_TEST_LEAK_MARKER = previous;
    }
  });

  // ---------------------------------------------------------------------
  // Tree-kill (T-011): killing the dev process must kill its descendants too
  // ---------------------------------------------------------------------

  it(
    "tree-kills a dev process's child on stop() — the grandchild dies, not just the top-level pid",
    async () => {
      await writeScript(
        "tree-child.js",
        `const fs = require("node:fs");
         const path = require("node:path");
         const dir = process.argv[2];
         fs.writeFileSync(path.join(dir, "child.pid"), String(process.pid));
         setInterval(() => fs.appendFileSync(path.join(dir, "child.heartbeat"), "."), 50);`,
      );
      const parentScript = await writeScript(
        "tree-parent.js",
        `const fs = require("node:fs");
         const path = require("node:path");
         const { spawn } = require("node:child_process");
         const dir = process.argv[2];
         fs.writeFileSync(path.join(dir, "parent.pid"), String(process.pid));
         spawn(process.execPath, [path.join(dir, "tree-child.js"), dir], { stdio: "ignore" });
         setInterval(() => {}, 1000);`,
      );

      const managed = await runner.startDevProcess({
        trust: trustedContext(),
        argv: [process.execPath, parentScript, dir],
        cwd: dir,
      });
      devProcesses.push(managed);

      await waitUntil(() => existsSync(join(dir, "child.pid")));
      const childPid = Number((await readFile(join(dir, "child.pid"), "utf8")).trim());
      expect(pidAlive(childPid)).toBe(true);

      // Let a couple of heartbeats land before killing.
      await waitUntil(async () => (await readFile(join(dir, "child.heartbeat"), "utf8")).length >= 2);

      const exits: Array<{ unexpected: boolean; restarted: boolean }> = [];
      managed.onExit((info) => exits.push(info));

      await managed.stop();

      // The grandchild (tree-child.js) must actually be gone — not just "no
      // error thrown" by stop().
      await waitUntil(() => !pidAlive(childPid));
      expect(pidAlive(childPid)).toBe(false);

      // Heartbeat file must stop growing once the process is truly dead
      // (guards against a not-yet-reaped zombie pid passing the liveness
      // check above).
      const before = (await readFile(join(dir, "child.heartbeat"), "utf8")).length;
      await wait(400);
      const after = (await readFile(join(dir, "child.heartbeat"), "utf8")).length;
      expect(after).toBe(before);

      expect(managed.stopped).toBe(true);
      expect(exits).toEqual([{ code: null, signal: "SIGTERM", unexpected: false, restarted: false }]);
    },
    15_000,
  );

  // ---------------------------------------------------------------------
  // Port liveness (T-011)
  // ---------------------------------------------------------------------

  it(
    "waitUntilReady() correctly waits for a dev process that opens its port after a delay",
    async () => {
      const port = await findFreePort();
      const OPEN_DELAY_MS = 400;
      const script = await writeScript(
        "delayed-listener.js",
        `const net = require("node:net");
         const port = Number(process.argv[2]);
         setTimeout(() => {
           const server = net.createServer((socket) => socket.end());
           server.listen(port, "127.0.0.1");
         }, ${OPEN_DELAY_MS});
         setInterval(() => {}, 1000);`,
      );

      const managed = await runner.startDevProcess({
        trust: trustedContext(),
        argv: [process.execPath, script, String(port)],
        cwd: dir,
        portLiveness: { port, intervalMs: 50, timeoutMs: 5_000 },
      });
      devProcesses.push(managed);

      const start = Date.now();
      await managed.waitUntilReady();
      const elapsed = Date.now() - start;

      // Proves it actually polled until the delayed open, rather than
      // resolving instantly (which would mean the check isn't really
      // checking anything).
      expect(elapsed).toBeGreaterThanOrEqual(OPEN_DELAY_MS - 100);
    },
    15_000,
  );

  it(
    "waitUntilReady() rejects when nothing ever opens the configured port",
    async () => {
      const port = await findFreePort();
      const script = await writeScript("never-listens.js", `setInterval(() => {}, 1000);`);

      const managed = await runner.startDevProcess({
        trust: trustedContext(),
        argv: [process.execPath, script],
        cwd: dir,
        portLiveness: { port, intervalMs: 30, timeoutMs: 300 },
      });
      devProcesses.push(managed);

      await expect(managed.waitUntilReady()).rejects.toThrow(/timed out/);
    },
    15_000,
  );

  // ---------------------------------------------------------------------
  // Health-checked restart (T-011: restart-not-signal)
  // ---------------------------------------------------------------------

  it(
    "restarts a long-running process that dies unexpectedly, bounded by maxRestarts",
    async () => {
      const script = await writeScript(
        "crash-immediately.js",
        `const fs = require("node:fs");
         const path = require("node:path");
         const dir = process.argv[2];
         const counterFile = path.join(dir, "restart-count.txt");
         let n = 0;
         try { n = Number(fs.readFileSync(counterFile, "utf8")); } catch {}
         fs.writeFileSync(counterFile, String(n + 1));
         process.exit(1);`,
      );

      const exits: Array<{ unexpected: boolean; restarted: boolean }> = [];
      const managed = await runner.startDevProcess({
        trust: trustedContext(),
        argv: [process.execPath, script, dir],
        cwd: dir,
        restart: { maxRestarts: 2, backoffMs: 50 },
      });
      devProcesses.push(managed);
      managed.onExit((info) => exits.push(info));

      // 1 initial run + 2 restarts = 3 total attempts, then it gives up.
      await waitUntil(async () => {
        if (!existsSync(join(dir, "restart-count.txt"))) return false;
        return Number((await readFile(join(dir, "restart-count.txt"), "utf8")).trim()) >= 3;
      });
      await waitUntil(() => managed.stopped);

      const finalCount = Number((await readFile(join(dir, "restart-count.txt"), "utf8")).trim());
      expect(finalCount).toBe(3);
      expect(managed.restartCount).toBe(2);
      expect(managed.stopped).toBe(true);
      expect(exits.filter((e) => e.unexpected)).toHaveLength(3);
      expect(exits.filter((e) => e.restarted)).toHaveLength(2);
      expect(exits.at(-1)).toEqual({ code: 1, signal: null, unexpected: true, restarted: false });
    },
    15_000,
  );

  it(
    "a deliberate stop() does not trigger a restart",
    async () => {
      const script = await writeScript("long-lived.js", `setInterval(() => {}, 1000);`);

      const exits: Array<{ unexpected: boolean; restarted: boolean }> = [];
      const managed = await runner.startDevProcess({
        trust: trustedContext(),
        argv: [process.execPath, script],
        cwd: dir,
        restart: { maxRestarts: 5, backoffMs: 50 },
      });
      devProcesses.push(managed);
      managed.onExit((info) => exits.push(info));

      await waitUntil(() => managed.pid !== undefined);
      await managed.stop();
      // Give a restart a chance to (wrongly) fire if the stop-flag were broken.
      await wait(300);

      expect(exits).toEqual([{ code: null, signal: "SIGTERM", unexpected: false, restarted: false }]);
      expect(managed.restartCount).toBe(0);
    },
    15_000,
  );
});
