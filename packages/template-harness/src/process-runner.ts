import { spawn, type ChildProcess } from "node:child_process";

// Command execution primitives, shared by the "run to completion" contract
// commands (install/build/lint/test/seed/migrate) and the long-lived `dev`
// process. Deliberately plain `node:child_process` — per this round's task
// scope, `packages/engine/src/contract-runner` (a sibling work package) isn't
// merged yet, so nothing here can depend on it.
//
// `shell: false` throughout: contract commands are argv arrays
// (`ContractCommandsSchema` — `z.array(z.string())`), not shell strings, so
// there's nothing to quote and no shell-injection surface.

const OUTPUT_TAIL_CHARS = 4000;

function tail(chunks: string, max = OUTPUT_TAIL_CHARS): string {
  return chunks.length > max ? `…(truncated)…${chunks.slice(-max)}` : chunks;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DevProcessHandle {
  child: ChildProcess;
  /** Resolves with the exit info once the process exits, for any reason (including us stopping it). */
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  stdoutTail(): string;
  stderrTail(): string;
}

/** Spawns a process detached into its own process group, so `stopDevProcess` can kill the whole
 * tree — not just the immediate child — on POSIX. Used for both the long-lived `dev` command and
 * (via `runToCompletion`) short-lived contract commands, so both get the same real tree-kill. */
export function spawnDevProcess(
  argv: string[],
  options: { cwd: string; env?: Record<string, string> | undefined },
): DevProcessHandle {
  const [command, ...args] = argv;
  if (!command) throw new Error("empty command array");

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
    child.on("error", () => resolve({ code: null, signal: null }));
  });

  return {
    child,
    exited,
    stdoutTail: () => tail(stdout),
    stderrTail: () => tail(stderr),
  };
}

export interface StopResult {
  /** False if the process had already exited on its own before we tried to stop it. */
  stopped: boolean;
  forced: boolean;
}

/** Real tree-kill: SIGTERM the process group (POSIX) or `taskkill /T` (Windows), escalating to a
 * force-kill if the process is still alive after `graceMs`. No-op (stopped: false) if the process
 * already exited. Escalation is judged by whether `exited` has actually resolved — NOT by
 * `child.killed`, which Node sets once a signal is successfully *sent*, not once the process has
 * actually died; keying off it would make the SIGKILL escalation dead code for anything that
 * ignores SIGTERM. */
export async function stopDevProcess(handle: DevProcessHandle, graceMs: number): Promise<StopResult> {
  const { child } = handle;
  if (child.exitCode !== null || child.signalCode !== null || child.killed) {
    return { stopped: false, forced: false };
  }

  const pid = child.pid;
  if (pid === undefined) return { stopped: false, forced: false };

  const alreadyExited = Promise.race([handle.exited.then(() => true), delay(0).then(() => false)]);
  if (await alreadyExited) return { stopped: false, forced: false };

  killTree(pid, "SIGTERM");

  const exitedInTime = await Promise.race([
    handle.exited.then(() => true),
    delay(graceMs).then(() => false),
  ]);

  if (exitedInTime) return { stopped: true, forced: false };

  killTree(pid, "SIGKILL");
  await Promise.race([handle.exited, delay(2000)]);
  return { stopped: true, forced: true };
}

function killTree(pid: number, signal: NodeJS.Signals): void {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    // Negative pid targets the whole process group created by `detached: true`.
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already gone.
    }
  }
}

export interface RunToCompletionResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Runs `argv` to completion, capturing output, and resolves once the process exits or the
 * timeout fires. Built on `spawnDevProcess`/`stopDevProcess` so a command that ignores SIGTERM
 * (or spawns its own children — e.g. `pnpm run build` → node) gets the same real, tested
 * tree-kill as the dev process, instead of hanging the caller past its own timeout. */
export async function runToCompletion(
  argv: string[],
  options: { cwd: string; timeoutMs: number; env?: Record<string, string> | undefined },
): Promise<RunToCompletionResult> {
  if (argv.length === 0 || !argv[0]) {
    return { exitCode: null, signal: null, stdout: "", stderr: "empty command array", timedOut: false };
  }

  const handle = spawnDevProcess(argv, { cwd: options.cwd, env: options.env });

  const race = await Promise.race([
    handle.exited.then((info) => ({ timedOut: false as const, info })),
    delay(options.timeoutMs).then(() => ({ timedOut: true as const })),
  ]);

  if (!race.timedOut) {
    return {
      exitCode: race.info.code,
      signal: race.info.signal,
      stdout: handle.stdoutTail(),
      stderr: handle.stderrTail(),
      timedOut: false,
    };
  }

  await stopDevProcess(handle, 2000);
  const info = await Promise.race([
    handle.exited,
    delay(500).then(() => ({ code: null, signal: null as NodeJS.Signals | null })),
  ]);

  return {
    exitCode: info.code,
    signal: info.signal,
    stdout: handle.stdoutTail(),
    stderr: handle.stderrTail(),
    timedOut: true,
  };
}
