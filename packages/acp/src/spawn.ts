import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { PassThrough, Readable, Writable } from "node:stream";
import { createInterface } from "node:readline";
import * as acp from "@agentclientprotocol/sdk";
import type { AgentDefinition } from "./registry.js";
import type { RawFrame } from "./types.js";

export interface SpawnedAgent {
  // `spawn(..., { stdio: ["pipe", "pipe", "inherit"] })` produces a
  // `ChildProcessByStdio<Writable, Readable, null>` — stderr is `null`
  // because "inherit" isn't a stream. `ChildProcess` (rather than the
  // stricter `ChildProcessWithoutNullStreams`) is the honest type for that.
  child: ChildProcess;
  /** The ACP SDK's transport stream — build a `client(...)` connection over
   * this exactly as the SDK's own examples do. */
  stream: acp.Stream;
  /**
   * Subscribes to every raw JSON-RPC line the agent process writes to
   * stdout, *before* the ACP SDK's zod validation runs on it.
   *
   * Why this exists (empirically confirmed, not speculative): the SDK's
   * `client(...)` builder validates every inbound `session/update`
   * notification against `zSessionNotification` unconditionally
   * (`SessionUpdateRouter.handleMessage` in the SDK's compiled bundle). An
   * adapter that sends a shape the schema rejects has its notification
   * silently dropped — logged internally, but never delivered to any
   * `.onNotification`/`ActiveSession` handler, and the connection does not
   * throw. `packages/stub-agent`'s scripted `session/update` payloads
   * (`{kind: "message_chunk", data: {text}}`) are exactly such a shape —
   * verified by driving the SDK against the stub agent's `hello-world`
   * scenario: `session/prompt` resolves with the correct `stopReason`, but
   * zero `session/update` notifications ever reach the client. Tapping the
   * raw frames here is what makes the transcript loss-proof against that
   * class of adapter incompatibility (AC-012's audit trail must not depend
   * on an adapter's wire fidelity).
   */
  onRawFrame(cb: (frame: RawFrame) => void): () => void;
  kill(): void;
}

/** Spawns an agent definition's process and wires a real stdio ACP
 * transport to it (TECH-STACK.md T-005: one process per stream). */
export function spawnAgent(
  def: AgentDefinition,
  opts: { cwd: string; extraEnv?: Record<string, string> },
): SpawnedAgent {
  const child = nodeSpawn(def.command, def.args, {
    cwd: opts.cwd,
    env: { ...process.env, ...def.env, ...opts.extraEnv },
    stdio: ["pipe", "pipe", "inherit"],
  });

  return wireStdioAgent(child);
}

/** Spawns an arbitrary command as an ACP agent over stdio — used by tests to
 * drive fixture agents and `packages/stub-agent`'s CLI directly, without
 * going through the registry's launch-shape conventions. */
export function spawnCommand(
  command: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string> },
): SpawnedAgent {
  const child = nodeSpawn(command, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: ["pipe", "pipe", "inherit"],
  });
  return wireStdioAgent(child);
}

function wireStdioAgent(child: ChildProcess): SpawnedAgent {
  // Two independent PassThrough taps off the same stdout: one feeds the ACP
  // SDK's stream (via a Web ReadableStream adapter), the other backs the
  // raw-frame observer below. A Node Readable can be piped to more than one
  // Writable, so this doesn't disturb what the SDK sees.
  const sdkTap = new PassThrough();
  const rawTap = new PassThrough();
  // Non-null: guaranteed by `stdio: ["pipe", "pipe", "inherit"]` above.
  const stdout = child.stdout!;
  const stdin = child.stdin!;
  stdout.pipe(sdkTap);
  stdout.pipe(rawTap);

  const listeners = new Set<(frame: RawFrame) => void>();
  const rl = createInterface({ input: rawTap, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return; // not JSON — nothing a transcript can attribute meaning to
    }
    const frame: RawFrame = { direction: "in", at: Date.now(), json };
    for (const cb of listeners) cb(frame);
  });

  // Order matters and is deliberately named against the SDK's own examples
  // (which name the variables backwards): `ndJsonStream`'s first argument is
  // OUR outbound stream (what we write, i.e. stdin), the second is what we
  // read (stdout).
  const stream = acp.ndJsonStream(
    Writable.toWeb(stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(sdkTap) as ReadableStream<Uint8Array>,
  );

  return {
    child,
    stream,
    onRawFrame(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    kill() {
      child.kill();
    },
  };
}
