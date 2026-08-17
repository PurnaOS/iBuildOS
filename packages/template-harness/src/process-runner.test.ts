import { describe, expect, it } from "vitest";
import { runToCompletion, spawnDevProcess, stopDevProcess } from "./process-runner.js";

function isAlive(pid: number): boolean {
  try {
    // Signal 0 doesn't actually signal anything — it just probes whether the
    // process exists and we're allowed to signal it, throwing ESRCH if not.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runToCompletion", () => {
  it("captures a clean exit", async () => {
    const result = await runToCompletion(["node", "-e", "process.exit(0)"], {
      cwd: process.cwd(),
      timeoutMs: 5000,
    });
    expect(result).toMatchObject({ exitCode: 0, timedOut: false });
  });

  it("captures a non-zero exit and stderr", async () => {
    const result = await runToCompletion(
      ["node", "-e", "console.error('boom'); process.exit(3)"],
      { cwd: process.cwd(), timeoutMs: 5000 },
    );
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain("boom");
  });

  it("kills a command that exceeds its timeout", async () => {
    const result = await runToCompletion(["node", "-e", "setInterval(() => {}, 1000)"], {
      cwd: process.cwd(),
      timeoutMs: 300,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it("resolves (not hangs) when the timed-out command ignores SIGTERM", async () => {
    // Regression coverage: an earlier implementation judged "did SIGKILL fire?"
    // by `child.killed`, which Node sets once a signal is *sent*, not once the
    // process has actually died — so a SIGTERM-ignorer would never resolve.
    const start = Date.now();
    const result = await runToCompletion(
      ["node", "-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
      { cwd: process.cwd(), timeoutMs: 300 },
    );
    const elapsed = Date.now() - start;

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    // Escalates to SIGKILL after a ~2s grace (see runToCompletion) rather than hanging forever.
    expect(elapsed).toBeLessThan(4000);
  });
});

describe("spawnDevProcess / stopDevProcess (real tree-kill)", () => {
  it("stops a plain long-lived process and it is actually gone afterward", async () => {
    const handle = spawnDevProcess(["node", "-e", "setInterval(() => {}, 1000)"], {
      cwd: process.cwd(),
    });
    await delay(200);
    expect(isAlive(handle.child.pid!)).toBe(true);

    const result = await stopDevProcess(handle, 2000);
    expect(result.stopped).toBe(true);
    expect(isAlive(handle.child.pid!)).toBe(false);
  });

  it("kills the whole process tree, not just the direct child", async () => {
    const script = [
      "const { spawn } = require('node:child_process');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "console.log('GRANDCHILD_PID=' + child.pid);",
      "setInterval(() => {}, 1000);",
    ].join("\n");

    const handle = spawnDevProcess(["node", "-e", script], { cwd: process.cwd() });

    let grandchildPid: number | undefined;
    for (let attempt = 0; attempt < 20 && grandchildPid === undefined; attempt++) {
      const match = /GRANDCHILD_PID=(\d+)/.exec(handle.stdoutTail());
      if (match?.[1]) grandchildPid = Number(match[1]);
      else await delay(100);
    }
    expect(grandchildPid).toBeDefined();
    expect(isAlive(grandchildPid!)).toBe(true);

    await stopDevProcess(handle, 2000);

    expect(isAlive(handle.child.pid!)).toBe(false);
    expect(isAlive(grandchildPid!)).toBe(false);
  });

  it("escalates to SIGKILL when the process ignores SIGTERM", async () => {
    const handle = spawnDevProcess(
      ["node", "-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
      { cwd: process.cwd() },
    );
    await delay(200);

    const result = await stopDevProcess(handle, 300);
    expect(result.stopped).toBe(true);
    expect(result.forced).toBe(true);
    expect(isAlive(handle.child.pid!)).toBe(false);
  });

  it("is a no-op when the process already exited on its own", async () => {
    const handle = spawnDevProcess(["node", "-e", "process.exit(0)"], { cwd: process.cwd() });
    await handle.exited;

    const result = await stopDevProcess(handle, 1000);
    expect(result).toEqual({ stopped: false, forced: false });
  });
});
