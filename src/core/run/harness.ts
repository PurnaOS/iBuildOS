// Spawns the pluggable coding harness (cfg.harness) for one task, with a per-task
// kill-timer. Shared by the Studio's agent-assist (no timeout) and the `iBuild
// run` loop. The prompt is substituted as ONE argv element — never a shell
// string — so it is injection-safe regardless of content (AG-006: any harness
// CLI works by config alone).
import type { Config } from "../config/config.ts";

// buildArgv substitutes the prompt as a SINGLE argv element — never a shell token.
export function buildArgv(cfg: Config, prompt: string): string[] {
  return [cfg.harness.command, ...cfg.harness.args.map((a) => (a === "{prompt}" ? prompt : a))];
}

export interface HarnessResult {
  exit: number;
  timedOut: boolean;
}

// TaskRunner is injectable so the run loop is testable without a live harness.
export type TaskRunner = (
  cfg: Config,
  cwd: string,
  prompt: string,
  emit: (line: string) => void,
  timeoutMs: number,
) => Promise<HarnessResult>;

// pumpLines streams a subprocess pipe to emit, line by line.
export async function pumpLines(stream: ReadableStream<Uint8Array> | undefined, emit: (line: string) => void): Promise<void> {
  if (!stream) return;
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) emit(l);
  }
  if (buf) emit(buf);
}

// spawnHarness runs the configured harness argv in cwd; a timeoutMs > 0 arms a
// kill-timer (the in-process stall guard the watchdog can't provide). The timer
// escalates SIGTERM -> SIGKILL so a harness that traps TERM cannot wedge the
// loop, and the pipe pumps get only a short grace after exit so a grandchild
// holding the inherited stdout/stderr open cannot block the next task.
export function spawnHarness(): TaskRunner {
  return async (cfg, cwd, prompt, emit, timeoutMs) => {
    const proc = Bun.spawn(buildArgv(cfg, prompt), { cwd, stdout: "pipe", stderr: "pipe" });
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      proc.kill();
      killTimer = setTimeout(() => proc.kill("SIGKILL"), 5_000);
    }, timeoutMs) : null;
    try {
      const pumps = Promise.all([pumpLines(proc.stdout, emit), pumpLines(proc.stderr, emit)]);
      const exit = await proc.exited;
      await Promise.race([pumps, new Promise<void>((r) => setTimeout(r, 500))]);
      return { exit, timedOut };
    } finally {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
    }
  };
}
